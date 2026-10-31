// Unit tests for the /remind command handler (US-5.1, US-5.3, US-5.4).
// Authored by the agent (Kiro CLI throttled).

import { describe, expect, it } from "vitest";

import {
  generateReminderId,
  humanizeDuration,
  remindHandler,
} from "./remind";
import type { CommandContext } from "./registry";
import type { Env, SessionId } from "../types";

// Minimal in-memory KV mock for command tests.
class MockKV {
  store = new Map<string, string>();
  async get(key: string, type?: string) {
    const v = this.store.get(key);
    if (v === undefined) return null;
    return type === "json" ? JSON.parse(v) : v;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}

const SID = "sess-test" as SessionId;

function ctx(kv: MockKV): CommandContext {
  return { env: { GHOST_KV: kv as unknown as KVNamespace } as Env, sessionId: SID };
}

describe("remindHandler — create (US-5.1)", () => {
  it("creates a reminder and replies with human-readable due time + id", async () => {
    const kv = new MockKV();
    const r = await remindHandler("30m call mom", ctx(kv));
    expect(r.kind).toBe("text");
    expect(String(r.payload)).toMatch(
      /Got it! I'll remind you in 30 minutes: "call mom" \(id: [0-9a-z]{6}\)/,
    );
    const stored = await kv.get(`session:${SID}:reminders`, "json");
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe("call mom");
    expect(stored[0].dueAt - stored[0].createdAt).toBe(1_800_000);
  });

  it("accepts combined durations (1h30m)", async () => {
    const kv = new MockKV();
    const r = await remindHandler("1h30m stretch", ctx(kv));
    expect(String(r.payload)).toContain("1 hour 30 minutes");
  });

  it("rejects an invalid duration", async () => {
    const kv = new MockKV();
    const r = await remindHandler("later sometime", ctx(kv));
    expect(r.kind).toBe("error");
    expect(String(r.payload)).toContain("didn't understand that time");
  });

  it("rejects a duration with no message", async () => {
    const kv = new MockKV();
    const r = await remindHandler("30m", ctx(kv));
    expect(r.kind).toBe("error");
    expect(String(r.payload)).toContain("do what");
  });

  it("shows usage when no args", async () => {
    const r = await remindHandler(undefined, ctx(new MockKV()));
    expect(r.kind).toBe("error");
    expect(String(r.payload)).toContain("Usage: /remind");
  });
});

describe("remindHandler — cancel (US-5.3)", () => {
  it("cancels a reminder by id", async () => {
    const kv = new MockKV();
    const c = ctx(kv);
    const created = await remindHandler("10m tea", c);
    const id = /\(id: ([0-9a-z]{6})\)/.exec(String(created.payload))![1];
    const r = await remindHandler(`cancel ${id}`, c);
    expect(String(r.payload)).toBe(`Reminder ${id} cancelled.`);
    expect(await kv.get(`session:${SID}:reminders`, "json")).toHaveLength(0);
  });

  it("reports when the id is not found", async () => {
    const r = await remindHandler("cancel zzzzzz", ctx(new MockKV()));
    expect(String(r.payload)).toContain("couldn't find");
  });
});

describe("remindHandler — list (US-5.4)", () => {
  it("lists reminders sorted by due time", async () => {
    const kv = new MockKV();
    const c = ctx(kv);
    await remindHandler("2h later one", c);
    await remindHandler("10m sooner one", c);
    const r = await remindHandler("list", c);
    const text = String(r.payload);
    expect(text.indexOf("sooner one")).toBeLessThan(text.indexOf("later one"));
    // Tolerate a second boundary crossing between create and list.
    expect(text).toMatch(/in (9|10) minutes/);
  });

  it("shows an empty-state message when no reminders exist", async () => {
    const r = await remindHandler("list", ctx(new MockKV()));
    expect(String(r.payload)).toContain("No reminders set");
  });
});

describe("helpers", () => {
  it("generates 6-char base36 ids", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateReminderId()).toMatch(/^[0-9a-z]{6}$/);
    }
  });

  it("humanizes durations", () => {
    expect(humanizeDuration(1_800_000)).toBe("30 minutes");
    expect(humanizeDuration(187_200_000)).toBe("2 days 4 hours");
    expect(humanizeDuration(1_000)).toBe("1 second");
  });
});

describe("KV failure degradation (US-7.2, design §7.3)", () => {
  it("still confirms when the KV write fails, with an honest caveat", async () => {
    const kv = new MockKV();
    kv.put = async () => { throw new Error("KV write failed"); };
    const r = await remindHandler("30m call mom", ctx(kv));
    expect(r.kind).toBe("text");
    expect(String(r.payload)).toContain("call mom");
    expect(String(r.payload)).toContain("might not stick");
  });
});
