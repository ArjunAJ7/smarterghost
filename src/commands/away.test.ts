// Unit tests for /away and /back (US-4.1, US-4.3).
// Authored by the agent (Kiro CLI throttled).

import { describe, expect, it } from "vitest";

import { awayHandler, backHandler } from "./away";
import type { CommandContext } from "./registry";
import type { Env, SessionId } from "../types";

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

const SID = "sess-away" as SessionId;

function ctx(kv: MockKV): CommandContext {
  return { env: { GHOST_KV: kv as unknown as KVNamespace } as Env, sessionId: SID };
}

describe("awayHandler (US-4.1)", () => {
  it("sets an away message and confirms", async () => {
    const kv = new MockKV();
    const r = await awayHandler("grabbing lunch", ctx(kv));
    expect(String(r.payload)).toContain('"grabbing lunch"');
    const stored = await kv.get(`session:${SID}:away`, "json");
    expect(stored.message).toBe("grabbing lunch");
    expect(typeof stored.setAt).toBe("number");
  });

  it("uses a default message when none is given", async () => {
    const kv = new MockKV();
    const r = await awayHandler(undefined, ctx(kv));
    expect(String(r.payload)).toContain('"Away from keyboard"');
  });
});

describe("backHandler (US-4.3)", () => {
  it("clears the away state and welcomes the user back", async () => {
    const kv = new MockKV();
    const c = ctx(kv);
    await awayHandler("brb", c);
    const r = await backHandler(undefined, c);
    expect(String(r.payload)).toContain("Welcome back");
    expect(String(r.payload)).toContain('"brb"');
    expect(await kv.get(`session:${SID}:away`, "json")).toBeNull();
  });

  it("responds in-character when the user was not away", async () => {
    const r = await backHandler(undefined, ctx(new MockKV()));
    expect(String(r.payload)).toContain("weren't away");
  });
});

describe("KV failure degradation (design §7.3)", () => {
  it("confirms away even when KV fails, with a caveat", async () => {
    const kv = new MockKV();
    kv.put = async () => { throw new Error("KV write failed"); };
    const r = await awayHandler("lunch", ctx(kv));
    expect(String(r.payload)).toContain('"lunch"');
    expect(String(r.payload)).toContain("flaky");
  });
});
