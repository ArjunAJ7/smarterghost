// Unit tests for the SSE transform and AI plumbing (US-2.1, design §5.3, §8.2).
// Authored by the agent (Kiro CLI throttled).

import { describe, expect, it } from "vitest";

import {
  AI_FALLBACK,
  AI_RATE_LIMITED,
  buildLlamaMessages,
  streamAIResponse,
  transformToSSE,
  SYSTEM_PROMPT,
} from "./ai";
import type { Env, SessionId } from "./types";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe("transformToSSE", () => {
  it("converts upstream chunks into token events and terminates with done", async () => {
    const upstream = streamFrom([
      'data: {"response": "Hello"}\n\n',
      'data: {"response": " there"}\n\n',
      'data: {"response": "!"}\n\n',
      "data: [DONE]\n\n",
    ]);
    const out = await readAll(transformToSSE(upstream));
    expect(out).toContain('event: token\ndata: {"text":"Hello"}');
    expect(out).toContain('event: token\ndata: {"text":" there"}');
    expect(out).toContain('event: token\ndata: {"text":"!"}');
    expect(out).toContain("event: done");
    expect(out.indexOf("event: done")).toBeGreaterThan(
      out.lastIndexOf("event: token"),
    );
  });

  it("handles events split across chunk boundaries", async () => {
    const upstream = streamFrom([
      'data: {"response": "Hel',
      'lo"}\n\ndata: {"response": "!"}\n',
      "\n",
    ]);
    const out = await readAll(transformToSSE(upstream));
    expect(out).toContain('{"text":"Hello"}');
    expect(out).toContain('{"text":"!"}');
  });

  it("skips malformed chunks without breaking the stream", async () => {
    const upstream = streamFrom([
      "data: not-json\n\n",
      'data: {"response": "ok"}\n\n',
    ]);
    const out = await readAll(transformToSSE(upstream));
    expect(out).toContain('{"text":"ok"}');
    expect(out).toContain("event: done");
  });

  it("emits an error event when the upstream stream fails", async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("upstream boom"));
      },
    });
    const out = await readAll(transformToSSE(failing));
    expect(out).toContain("event: error");
    expect(out).toContain(AI_FALLBACK);
  });
});

describe("buildLlamaMessages", () => {
  it("prepends the persona system prompt", () => {
    const msgs = buildLlamaMessages([{ role: "user", content: "hi" }]);
    expect(msgs[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(msgs[1]).toEqual({ role: "user", content: "hi" });
  });
});

describe("streamAIResponse error paths", () => {
  const SID = "sess-ai" as SessionId;

  it("returns a fallback error event when Workers AI throws", async () => {
    const env = {
      AI: { run: async () => { throw new Error("model unavailable"); } },
    } as unknown as Env;
    const out = await readAll(await streamAIResponse(env, [], SID));
    expect(out).toContain("event: error");
    expect(out).toContain(AI_FALLBACK);
  });

  it("returns the degraded-mode message on 429 / rate limit", async () => {
    const env = {
      AI: { run: async () => { throw new Error("HTTP 429: rate limited"); } },
    } as unknown as Env;
    const out = await readAll(await streamAIResponse(env, [], SID));
    expect(out).toContain(AI_RATE_LIMITED);
  });
  it("treats free-quota exhaustion as degraded mode", async () => {
    const env = {
      AI: { run: async () => { throw new Error("Usage quota exceeded for today"); } },
    } as never;
    const stream = await streamAIResponse(env, [], "s1");
    const text = await new Response(stream).text();
    expect(text).toContain(AI_RATE_LIMITED);
  });

});
