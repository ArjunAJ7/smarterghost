// Unit tests for route dispatching in worker.ts (design §8.2, task 3.24).
// Authored by the agent (Kiro CLI throttled).

import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./worker";
import type { Env } from "./types";

class MockKV {
  store = new Map<string, string>();
  async get(key: any, type?: any): Promise<any> {
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
  async list(): Promise<any> {
    return { keys: [], list_complete: true, cacheStatus: null };
  }
  async getWithMetadata(..._a: any[]): Promise<any> {
    return { value: null, metadata: null, cacheStatus: null };
  }
}

function makeEnv(overrides: Partial<Env> = {}): { env: Env; kv: MockKV } {
  const kv = new MockKV();
  const env = {
    ASSETS: {
      fetch: async (r: Request) => {
        const path = new URL(r.url).pathname;
        if (path === "/" || path === "/app.js" || path === "/aim.css") {
          return new Response("<html>spa</html>", { status: 200 });
        }
        return new Response("Not Found", { status: 404 });
      },
    },
    AI: {
      run: async () =>
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: {"response": "hey"}\n\n'));
            c.close();
          },
        }),
    },
    GHOST_KV: kv as unknown as KVNamespace,
    ...overrides,
  } as unknown as Env;
  return { env, kv };
}

function req(
  method: string,
  path: string,
  body?: unknown,
  sessionId = "sess-1",
): Request {
  return new Request(`https://ghost.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(sessionId ? { "X-Session-Id": sessionId } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function readAll(res: Response): Promise<string> {
  return await res.text();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("worker routing", () => {
  it("GET / serves the SPA via ASSETS", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(req("GET", "/", undefined, ""), env);
    expect(await res.text()).toBe("<html>spa</html>");
  });

  it("returns 404 for unknown routes", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(req("GET", "/nope", undefined, ""), env);
    expect(res.status).toBe(404);
  });

  it("POST /api/chat without X-Session-Id is a 400", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      req("POST", "/api/chat", { input: "hi" }, ""),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/chat dispatches a slash command as a command event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ hits: [] }), { status: 200 }),
      ),
    );
    const { env } = makeEnv();
    const res = await worker.fetch(
      req("POST", "/api/chat", { input: "/news" }),
      env,
    );
    const out = await readAll(res);
    expect(out).toContain("event: command");
    expect(out).toContain("No headlines");
    expect(out).toContain("event: done");
  });

  it("unknown commands return the help fallback", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      req("POST", "/api/chat", { input: "/frobnicate" }),
      env,
    );
    const out = await readAll(res);
    expect(out).toContain("I don't know");
    expect(out).toContain("SmarterGhost commands");
  });

  it("free text routes to the AI handler and streams token events", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      req("POST", "/api/chat", { input: "hello ghost" }),
      env,
    );
    const out = await readAll(res);
    expect(out).toContain('event: token\ndata: {"text":"hey"}');
    expect(out).toContain("event: done");
  });

  it("any user message auto-clears away status (US-4.2)", async () => {
    const { env, kv } = makeEnv();
    kv.store.set(
      "session:sess-1:away",
      JSON.stringify({ message: "brb", setAt: Date.now() }),
    );
    await worker.fetch(req("POST", "/api/chat", { input: "/back" }), env);
    expect(kv.store.has("session:sess-1:away")).toBe(false);
  });
});

describe("POST /api/away", () => {
  it("sets and clears away status", async () => {
    const { env, kv } = makeEnv();
    const setRes = await worker.fetch(
      req("POST", "/api/away", { message: "lunch" }),
      env,
    );
    expect(setRes.status).toBe(200);
    expect(kv.store.has("session:sess-1:away")).toBe(true);

    const clearRes = await worker.fetch(
      req("POST", "/api/away", { clear: true }),
      env,
    );
    expect(clearRes.status).toBe(200);
    expect(kv.store.has("session:sess-1:away")).toBe(false);
  });
});

describe("GET /api/poll-reminders", () => {
  it("emits due reminders on connect and removes them from KV", async () => {
    const { env, kv } = makeEnv();
    kv.store.set(
      "session:sess-1:reminders",
      JSON.stringify([
        { id: "abc123", message: "tea", dueAt: Date.now() - 1000, createdAt: 0 },
        { id: "def456", message: "later", dueAt: Date.now() + 3_600_000, createdAt: 0 },
      ]),
    );
    const res = await worker.fetch(
      req("GET", "/api/poll-reminders"),
      env,
    );
    // Read only what is available immediately, then cancel the stream.
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let out = "";
    const read = await Promise.race([
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          out += decoder.decode(value, { stream: true });
          if (out.includes("event: reminder")) break;
        }
      })(),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    void read;
    await reader.cancel();
    expect(out).toContain("event: reminder");
    expect(out).toContain('"tea"');
    expect(out).not.toContain("later");

    const remaining = JSON.parse(
      kv.store.get("session:sess-1:reminders") ?? "[]",
    ) as { id: string }[];
    expect(remaining.map((r) => r.id)).toEqual(["def456"]);
  });
});

describe("away auto-clear vs /back (US-4.2, US-4.3)", () => {
  it("/back sees the away state and welcomes the user back", async () => {
    const { env, kv } = makeEnv();
    kv.store.set(
      "session:sess-1:away",
      JSON.stringify({ message: "brb", setAt: Date.now() }),
    );
    const res = await worker.fetch(
      req("POST", "/api/chat", { input: "/back" }),
      env,
    );
    const out = await res.text();
    expect(out).toContain("Welcome back");
    expect(out).toContain("brb");
    expect(kv.store.has("session:sess-1:away")).toBe(false);
  });
});
