// src/worker.ts
// SmarterGhost Cloudflare Worker entry point (design §1.2).
// Phase 3F: routes /api/chat, /api/away, /api/poll-reminders.
// Authored by the agent (Kiro CLI throttled).

import type { Env, SessionId } from "./types";
import { routeInput } from "./commands/parser";
import { lookupCommand } from "./commands/registry";
import "./commands/index"; // populates the registry
import { unknownCommandResult } from "./commands/help";
import { streamAIResponse, type ChatMessage } from "./ai";
import { clearAwayState, getAwayState, setAwayState } from "./kv";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
} as const;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Wrap pre-formatted SSE text events in a Response stream. */
function sseResponse(...events: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const e of events) controller.enqueue(encoder.encode(e));
        controller.close();
      },
    }),
    { headers: SSE_HEADERS },
  );
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

function requireSessionId(request: Request): SessionId | Response {
  const sid = request.headers.get("X-Session-Id");
  if (!sid) return jsonError(400, "Missing X-Session-Id header");
  return sid;
}

interface ChatBody {
  input?: string;
  history?: ChatMessage[];
}

/** POST /api/chat — command dispatch or AI streaming (design §1.2). */
async function handleChat(request: Request, env: Env): Promise<Response> {
  const sid = requireSessionId(request);
  if (sid instanceof Response) return sid;

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const input = body.input?.trim();
  if (!input) return jsonError(400, "Missing input");
  if (input.length > 1000) return jsonError(400, "Message too long (max 1000 chars)");

  const route = routeInput(input);

  // US-4.2: any user message auto-clears the away status — except /back,
  // which clears it explicitly and reports the previous away message.
  if (route.command !== "back" && (await getAwayState(env.GHOST_KV, sid))) {
    await clearAwayState(env.GHOST_KV, sid);
  }

  if (route.kind === "ai") {
    const stream = await streamAIResponse(env, body.history ?? [], sid);
    return new Response(stream, { headers: SSE_HEADERS });
  }

  const spec = lookupCommand(route.command!);
  const result = spec
    ? await spec.handler(route.args, { env, sessionId: sid })
    : unknownCommandResult(route.command!);

  if (result.kind === "stream") {
    return new Response(result.payload as ReadableStream<Uint8Array>, {
      headers: SSE_HEADERS,
    });
  }
  if (result.kind === "error") {
    return sseResponse(
      sseEvent("error", { message: result.payload }),
      sseEvent("done", { messageId: crypto.randomUUID() }),
    );
  }
  return sseResponse(
    sseEvent("command", { text: result.payload }),
    sseEvent("done", { messageId: crypto.randomUUID() }),
  );
}

interface AwayBody {
  message?: string;
  clear?: boolean;
}

/** POST /api/away — set or clear away status (design §1.2). */
async function handleAway(request: Request, env: Env): Promise<Response> {
  const sid = requireSessionId(request);
  if (sid instanceof Response) return sid;

  let body: AwayBody;
  try {
    body = (await request.json()) as AwayBody;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (body.clear) {
    await clearAwayState(env.GHOST_KV, sid);
    return Response.json({ away: false });
  }
  const message = body.message?.trim() || "Away from keyboard";
  await setAwayState(env.GHOST_KV, sid, { message, setAt: Date.now() });
  return Response.json({ away: true, message });
}

/**
 * GET /api/poll-reminders — SSE: emit due reminders on connect and every
 * 15s while connected; fired reminders are removed (US-5.2, US-5.5).
 */
async function handlePollReminders(
  request: Request,
  env: Env,
): Promise<Response> {
  // EventSource cannot set headers, so this endpoint also accepts ?sid=.
  const url = new URL(request.url);
  const sidParam = url.searchParams.get("sid");
  const sid = sidParam ?? requireSessionId(request);
  if (sid instanceof Response) return sid;

  const encoder = new TextEncoder();
  const { getReminders, saveReminders } = await import("./kv");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitDue = async () => {
        const reminders = await getReminders(env.GHOST_KV, sid);
        const now = Date.now();
        const due = reminders.filter((r) => r.dueAt <= now);
        if (due.length === 0) return;
        for (const r of due) {
          controller.enqueue(
            encoder.encode(
              sseEvent("reminder", { id: r.id, message: r.message }),
            ),
          );
        }
        await saveReminders(
          env.GHOST_KV,
          sid,
          reminders.filter((r) => r.dueAt > now),
        );
      };

      await emitDue();
      const interval = setInterval(() => {
        emitDue().catch(() => clearInterval(interval));
      }, 15_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/" || !url.pathname.startsWith("/api/"))) {
      const assetRes = await env.ASSETS.fetch(request);
      // US-7.3 / design §1.2: cache static assets at the edge and in browsers.
      const headers = new Headers(assetRes.headers);
      headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
      return new Response(assetRes.body, { status: assetRes.status, headers });
    }
    if (request.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(request, env);
    }
    if (request.method === "POST" && url.pathname === "/api/away") {
      return handleAway(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/poll-reminders") {
      return handlePollReminders(request, env);
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
