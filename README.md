# SmarterGhost

Resurrecting the AIM-era chatbot (RIP SmarterChild, 2017) as a modern AI assistant inside a faithful retro AIM-style interface.

**Kiroween 2026 entry — category: Resurrection.** Built with Kiro (spec-driven development).

**Live app:** https://smarterghost.arjun-vinod0028.workers.dev

## What it does

SmarterGhost brings back the late-90s AIM buddy experience — buddy list, away
messages, IM window, door sounds — but the "bot" on the other side is a modern
LLM (Llama 3.1 8B on Cloudflare Workers AI) instead of SmarterChild's canned
pattern matching. It also does useful things SmarterChild never could:

| Command | What it does |
|---|---|
| `/weather <place>` | Current conditions + 1-line forecast (Open-Meteo) |
| `/wiki <topic>` | Wikipedia summary, max 300 words, with link |
| `/define <word>` | Definitions, parts of speech, pronunciation |
| `/news` | Top 5 HackerNews front-page headlines |
| `/remind <time> <msg>` | Relative reminders, e.g. `/remind 1h30m stretch` |
| `/reminders` | List pending reminders |
| `/remind cancel <id>` | Cancel a reminder |
| `/away <msg>` / `/back` | Classic away messages, with buddy-list sync |
| `/help` | List all commands |
| *(anything else)* | Free-text AI chat with the SmarterGhost persona |

## Tech stack

- **Cloudflare Workers** — single Worker serves the SPA and the API
- **Workers AI** — `@cf/meta/llama-3.1-8b-instruct`, streamed over SSE
- **Workers KV** — session-scoped reminders, away state, screen names
- **Vanilla TypeScript SPA** — no framework, bundled with esbuild
- **Vitest + fast-check** — unit, property-based, and integration tests

## Development

```bash
npm install
npm run dev        # wrangler dev (local)
npm test           # 133 unit + property + integration tests
npm run build:ui   # rebuild public/app.js from src/ui
npm run deploy     # wrangler deploy
```

## Architecture

- `src/worker.ts` — routes: `POST /api/chat` (command dispatch or AI SSE
  stream), `POST /api/away`, `GET /api/poll-reminders` (SSE), static assets
  with cache headers
- `src/commands/` — parser (lexical routing), registry (data-driven dispatch),
  one module per command
- `src/ai.ts` — persona system prompt, Workers AI streaming, SSE transform,
  in-character error and rate-limit fallbacks
- `src/kv.ts` — KV adapter with per-session namespaced keys and TTLs
- `src/ui/` — BuddyList, ChatWindow, ChatInputBar, AwayMessageBanner,
  SoundToggle, App (session + history in localStorage)
- `.kiro/specs/smarterghost/` — requirements, design, and task specs driving
  the build (Kiro spec-driven development)

## Built with Kiro

The spec files in `.kiro/specs/smarterghost/` (requirements.md, design.md,
tasks.md) were authored with Kiro, and Kiro (IDE + CLI) implemented the core
parser, registry, reminder-time engine, KV adapter, and their property tests.
Per-commit messages attribute which parts were written by Kiro vs. by hand.

## License

MIT
