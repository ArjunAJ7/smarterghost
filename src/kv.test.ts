// src/kv.test.ts
// Unit tests for KV helpers (src/kv.ts).
// Design references: §4.1 (key scheme + TTLs), §4.2 (data structures),
//                   §4.3 (read/write strategy), §4.4 (reminder lifecycle).
//
// Uses an in-memory mock implementing the relevant subset of the
// KVNamespace interface so tests run without real Cloudflare KV.

import { describe, expect, it } from "vitest";

import {
  _keys,
  _ttl,
  addReminder,
  cancelReminder,
  clearAwayState,
  getAwayState,
  getReminders,
  getScreenName,
  saveReminders,
  setAwayState,
  setScreenName,
} from "./kv";
import type { Reminder } from "./types";

// ---------------------------------------------------------------------------
// In-memory KV mock
// ---------------------------------------------------------------------------

interface StoredValue {
  value: string;
  expirationTtl?: number;
  expiration?: number; // absolute epoch seconds (set from ttl for verification)
  putAt: number; // ms when written
}

/**
 * Minimal in-memory KV that implements the subset of KVNamespace used by
 * src/kv.ts: `get` with "json" type, `put` with optional `expirationTtl`,
 * and `delete`.
 *
 * The mock records all `put` options so tests can assert TTL passthrough.
 *
 * NOTE: `get` is a single method (not overloaded) because TypeScript class
 * method overloads collapse at runtime — only the last definition survives.
 */
class MockKV {
  private store = new Map<string, StoredValue>();

  // --- introspection helpers for tests ---

  /** All keys written (preserves insertion order). */
  get keys(): string[] {
    return [...this.store.keys()];
  }

  /** Raw stored entry for TTL assertions. */
  raw(key: string): StoredValue | undefined {
    return this.store.get(key);
  }

  // --- KVNamespace subset ---

  /**
   * Single get implementation. When `type === "json"` the value is parsed;
   * otherwise the raw string is returned. This satisfies the structural
   * shape expected by src/kv.ts callers (which always pass "json").
   */
  async get(key: string, type?: "json" | "text"): Promise<unknown> {
    const entry = this.store.get(key);
    if (entry === undefined) return null;
    return type === "json" ? JSON.parse(entry.value) : entry.value;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    const nowMs = Date.now();
    this.store.set(key, {
      value: typeof value === "string" ? value : String(value),
      expirationTtl: options?.expirationTtl,
      expiration: options?.expirationTtl
        ? Math.floor(nowMs / 1_000) + options.expirationTtl
        : undefined,
      putAt: nowMs,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Stubs for methods required by the interface but not exercised here.
  async list(): Promise<{
    keys: [];
    list_complete: true;
    cacheStatus: null;
  }> {
    return { keys: [], list_complete: true, cacheStatus: null };
  }
  getWithMetadata(): Promise<{
    value: string | null;
    metadata: null;
    cacheStatus: null;
  }> {
    return Promise.resolve({ value: null, metadata: null, cacheStatus: null });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SID = "sess-123";

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "abc123",
    message: "test reminder",
    dueAt: Date.now() + 60_000,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("key scheme (design §4.1)", () => {
  it("builds namespaced keys for each data type", () => {
    expect(_keys.away(SID)).toBe("session:sess-123:away");
    expect(_keys.screenname(SID)).toBe("session:sess-123:screenname");
    expect(_keys.reminders(SID)).toBe("session:sess-123:reminders");
    expect(_keys.reminderDue(SID, 1000)).toBe(
      "session:sess-123:reminders:due:1000",
    );
  });

  it("isolates sessions by ID in the key namespace", () => {
    expect(_keys.reminders("a")).not.toBe(_keys.reminders("b"));
    expect(_keys.reminders("a")).not.toBe(_keys.away("a"));
  });
});

describe("TTL constants (design §4.1)", () => {
  it("away state TTL is 7 days", () => {
    expect(_ttl.away).toBe(7 * 24 * 60 * 60);
  });

  it("screen name TTL is 30 days", () => {
    expect(_ttl.screenname).toBe(30 * 24 * 60 * 60);
  });
});

describe("reminders — get / save", () => {
  it("returns an empty array when no reminders exist", async () => {
    const kv = new MockKV();
    const result = await getReminders(kv, SID);
    expect(result).toEqual([]);
  });

  it("saves and retrieves a reminders array", async () => {
    const kv = new MockKV();
    const reminders = [makeReminder(), makeReminder({ id: "def456" })];
    await saveReminders(kv, SID, reminders);
    expect(await getReminders(kv, SID)).toEqual(reminders);
  });

  it("stores reminders as a single JSON array key (design §4.3.1)", async () => {
    const kv = new MockKV();
    await saveReminders(kv, SID, [makeReminder()]);
    expect(kv.keys).toEqual(["session:sess-123:reminders"]);
  });
});

describe("reminders — add", () => {
  it("appends a reminder to the existing array", async () => {
    const kv = new MockKV();
    const first = makeReminder({ id: "r1" });
    const second = makeReminder({ id: "r2", message: "second" });

    await addReminder(kv, SID, first);
    expect(await getReminders(kv, SID)).toHaveLength(1);

    await addReminder(kv, SID, second);
    const result = await getReminders(kv, SID);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("writes a due-check key with TTL (design §4.4)", async () => {
    const kv = new MockKV();
    const dueAt = Date.now() + 3_600_000; // 1h from now
    const reminder = makeReminder({ id: "r1", dueAt });

    await addReminder(kv, SID, reminder);

    const dueKey = _keys.reminderDue(SID, dueAt);
    expect(kv.keys).toContain(dueKey);

    const entry = kv.raw(dueKey);
    expect(entry).toBeDefined();
    expect(entry?.expirationTtl).toBeGreaterThan(0);
    // TTL = dueAt + 1h - now; dueAt is 1h out, so expect ~2h (design 4.1).
    // Allow a few seconds of slack between computing dueAt and the put call.
    expect(entry?.expirationTtl).toBeGreaterThan(7190);
    expect(entry?.expirationTtl).toBeLessThanOrEqual(7201);
  });

  it("clamps the due-check TTL to a minimum of 1 second", async () => {
    const kv = new MockKV();
    // Due time already in the past — TTL would be negative without clamping.
    const reminder = makeReminder({ id: "r1", dueAt: Date.now() - 10_000 });

    await addReminder(kv, SID, reminder);

    const entry = kv.raw(_keys.reminderDue(SID, reminder.dueAt));
    expect(entry?.expirationTtl).toBeGreaterThanOrEqual(1);
  });
});

describe("reminders — cancel", () => {
  it("removes a reminder by id and returns true", async () => {
    const kv = new MockKV();
    const r1 = makeReminder({ id: "r1" });
    const r2 = makeReminder({ id: "r2", dueAt: Date.now() + 120_000 });
    await addReminder(kv, SID, r1);
    await addReminder(kv, SID, r2);

    const result = await cancelReminder(kv, SID, "r1");
    expect(result).toBe(true);

    const remaining = await getReminders(kv, SID);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("r2");
  });

  it("deletes the due-check key when cancelling", async () => {
    const kv = new MockKV();
    const r1 = makeReminder({ id: "r1", dueAt: Date.now() + 60_000 });
    await addReminder(kv, SID, r1);

    await cancelReminder(kv, SID, "r1");
    expect(kv.keys).not.toContain(_keys.reminderDue(SID, r1.dueAt));
  });

  it("returns false when the reminder id does not exist", async () => {
    const kv = new MockKV();
    await addReminder(kv, SID, makeReminder({ id: "r1" }));
    const result = await cancelReminder(kv, SID, "nope");
    expect(result).toBe(false);
    expect(await getReminders(kv, SID)).toHaveLength(1);
  });

  it("does not affect other sessions' reminders", async () => {
    const kv = new MockKV();
    const r1 = makeReminder({ id: "r1" });
    await addReminder(kv, "sess-a", r1);
    await addReminder(kv, "sess-b", makeReminder({ id: "r2" }));

    await cancelReminder(kv, "sess-a", "r1");
    expect(await getReminders(kv, "sess-b")).toHaveLength(1);
  });
});

describe("away state", () => {
  it("returns null when no away state is set", async () => {
    const kv = new MockKV();
    expect(await getAwayState(kv, SID)).toBeNull();
  });

  it("sets and gets the away state", async () => {
    const kv = new MockKV();
    const away = { message: "brb lunch", setAt: Date.now() };
    await setAwayState(kv, SID, away);
    expect(await getAwayState(kv, SID)).toEqual(away);
  });

  it("writes with a 7-day TTL (design §4.1)", async () => {
    const kv = new MockKV();
    await setAwayState(kv, SID, { message: "away", setAt: Date.now() });
    const entry = kv.raw(_keys.away(SID));
    expect(entry?.expirationTtl).toBe(7 * 24 * 60 * 60);
  });

  it("clears the away state", async () => {
    const kv = new MockKV();
    await setAwayState(kv, SID, { message: "away", setAt: Date.now() });
    expect(await getAwayState(kv, SID)).not.toBeNull();

    await clearAwayState(kv, SID);
    expect(await getAwayState(kv, SID)).toBeNull();
    expect(kv.keys).not.toContain(_keys.away(SID));
  });
});

describe("screen name", () => {
  it("returns null when no screen name is set", async () => {
    const kv = new MockKV();
    expect(await getScreenName(kv, SID)).toBeNull();
  });

  it("sets and gets the screen name", async () => {
    const kv = new MockKV();
    const sn = { name: "GhostFan99", createdAt: Date.now() };
    await setScreenName(kv, SID, sn);
    expect(await getScreenName(kv, SID)).toEqual(sn);
  });

  it("writes with a 30-day TTL (design §4.1)", async () => {
    const kv = new MockKV();
    await setScreenName(kv, SID, { name: "GhostFan99", createdAt: Date.now() });
    const entry = kv.raw(_keys.screenname(SID));
    expect(entry?.expirationTtl).toBe(30 * 24 * 60 * 60);
  });
});
