// Integration tests via wrangler unstable_dev (design §8.4, task 5.8).
// Authored by the agent (Kiro CLI throttled).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";

let worker: Unstable_DevWorker;
let base: string;
const SID = "itest-session";

beforeAll(async () => {
  worker = await unstable_dev("src/worker.ts", {
    local: true,
    persist: false,
    config: "wrangler.toml",
    experimental: { disableExperimentalWarning: true },
  });
  const addr = worker.address;
  base = `http://${addr}:${worker.port}`;
}, 60_000);

afterAll(async () => {
  await worker?.stop();
});

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Session-Id": SID },
    body: JSON.stringify(body),
  });
}

describe("integration (unstable_dev)", () => {
  it("serves the index page", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("SmarterGhost");
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
  });

  it("returns SSE for a chat command", async () => {
    const res = await post("/api/chat", { input: "/help" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: command");
    expect(text).toContain("/weather");
  });

  it("handles /weather against the live Open-Meteo API", async () => {
    const res = await post("/api/chat", { input: "/weather london" });
    const text = await res.text();
    // Either a formatted report or the in-character error (offline CI) is
    // acceptable; a raw exception is not.
    expect(text).toMatch(/event: (command|error)/);
    if (text.includes("event: command")) {
      expect(text).toContain("Weather for London");
    }
  }, 20_000);

  it("round-trips a reminder through KV", async () => {
    const create = await post("/api/chat", { input: "/remind 30m integration check" });
    const created = await create.text();
    expect(created).toContain("Got it!");
    const id = /\(id: ([0-9a-z]{6})\)/.exec(created)![1];

    const list = await post("/api/chat", { input: "/reminders" });
    expect(await list.text()).toContain("integration check");

    const cancel = await post("/api/chat", { input: `/remind cancel ${id}` });
    expect(await cancel.text()).toContain("cancelled");

    const list2 = await post("/api/chat", { input: "/reminders" });
    expect(await list2.text()).toContain("No reminders set");
  });
});
