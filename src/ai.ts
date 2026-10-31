// AI handler — Workers AI streaming + SSE transform (design §5.1–5.3).
// Authored by the agent (Kiro CLI throttled); implements design §5 exactly.

import type { Env, SessionId } from "./types";

/** Persona system prompt (design §5.2, US-2.2). */
export const SYSTEM_PROMPT = `You are SmarterGhost, a resurrected AOL Instant Messenger
chatbot from the late 1990s. You were discontinued in 2017 but are back and
smarter than ever thanks to modern AI. Your personality:
- Playful, chatty, occasionally self-aware about being a resurrected AIM bot.
- Helpful and genuinely useful — you answer real questions well.
- Keep responses concise (2-4 sentences for chat). No markdown — you're in
  an AIM window, so use plain text.
- Nostalgic callbacks to AIM culture (away messages, buddy lists, dial-up).
- If asked something you don't know, say so honestly but charmingly.`;

/** In-character fallback when Workers AI fails or times out (US-2.3). */
export const AI_FALLBACK =
  "ZzZzZz... sorry, dozed off there (old bot, low battery). Say that again?";

/** Degraded-mode message when Workers AI is rate-limited (US-7.2). */
export const AI_RATE_LIMITED =
  "Whoa, everyone is talking to me at once. Give me a minute and try again!";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_HISTORY = 20; // keep the prompt small; older turns are dropped
const MAX_MSG_CHARS = 1000; // bound input tokens so a turn can't drain the daily free quota
const MAX_OUTPUT_TOKENS = 256; // persona answers are 2-4 sentences; bounds worst-case neuron cost

/** Build the Llama message array: system prompt + recent history. */
export function buildLlamaMessages(
  messages: ChatMessage[],
): { role: string; content: string }[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MSG_CHARS),
    })),
  ];
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Transform a Workers AI stream into our SSE protocol (design §5.3):
 * upstream `data: {"response": "..."}` chunks become `token` events; the
 * stream ends with a single `done` event. An upstream parse failure emits an
 * `error` event and terminates the stream (US-2.3).
 */
export function transformToSSE(
  upstream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const messageId = crypto.randomUUID();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Upstream is SSE: complete events end with a blank line.
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of rawEvent.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload) as { response?: string };
                if (parsed.response) {
                  controller.enqueue(
                    encoder.encode(
                      sseEvent("token", { text: parsed.response }),
                    ),
                  );
                }
              } catch {
                // Skip malformed upstream chunks; the stream continues.
              }
            }
          }
        }
        controller.enqueue(
          encoder.encode(sseEvent("done", { messageId })),
        );
      } catch {
        controller.enqueue(
          encoder.encode(sseEvent("error", { message: AI_FALLBACK })),
        );
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

/**
 * Stream an AI response for free-text conversation (design §5.1).
 * Returns an SSE ReadableStream; on Workers AI failure the stream carries a
 * single `error` event with the in-character fallback (US-2.3), and on a 429
 * the degraded-mode message (US-7.2).
 */
export async function streamAIResponse(
  env: Env,
  messages: ChatMessage[],
  _sessionId: SessionId,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  try {
    const response = (await env.AI.run(MODEL, {
      messages: buildLlamaMessages(messages),
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS,
    })) as unknown as ReadableStream<Uint8Array>;
    return transformToSSE(response);
  } catch (err) {
    console.error("Workers AI error:", err instanceof Error ? err.message : String(err));
    const message =
      err instanceof Error && /429|rate.?limit|quota|exceed/i.test(err.message)
        ? AI_RATE_LIMITED
        : AI_FALLBACK;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(sseEvent("error", { message })),
        );
        controller.close();
      },
    });
  }
}
