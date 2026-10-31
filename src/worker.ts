// src/worker.ts
// SmarterGhost Cloudflare Worker entry point.
//
// Phase 1: minimal fetch handler that serves the static index page for GET /
// via the ASSETS binding and returns 404 for every other route. Additional
// routes (/api/chat, /api/away, /api/poll-reminders) are wired in Phase 3.

import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // GET / — serve the SPA shell from the static asset binding.
    if (request.method === "GET" && url.pathname === "/") {
      return env.ASSETS.fetch(request);
    }

    // Everything else is not yet implemented.
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
// scoped-token deploy check
