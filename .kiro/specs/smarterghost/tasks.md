# SmarterGhost — Implementation Tasks

> Ordered for early deployability: scaffold first, then parser + tests, then
> commands, then retro UI, then polish. Each task references the requirement
> IDs it satisfies. Check items off as you complete them.

---

## Phase 1 — Wrangler Scaffold & Hello Worker

Goal: a deployable Cloudflare Worker that returns "SmarterGhost online" and
serves a placeholder `index.html`. This proves the toolchain and deployment
pipeline before any feature work.

- [x] **1.1** Initialize project: `package.json` with `wrangler`, `vitest`, `fast-check`, `vitest-fast-check`, `typescript` dev deps; add `build`, `dev`, `test`, `deploy` scripts. *(infra)*
- [x] **1.2** Create `tsconfig.json` with `target: "ES2022"`, `module: "ES2022"`, `moduleResolution: "bundler"`, strict mode, and Cloudflare `@cloudflare/workers-types`. *(infra)*
- [x] **1.3** Create `wrangler.toml` with `name`, `main = "src/worker.ts"`, `compatibility_date`, `assets` binding (directory `./public`), `AI` binding, and `GHOST_KV` namespace placeholder. *(infra — design §1.3)*
- [x] **1.4** Create `src/types.ts` with `Env` interface (`ASSETS`, `AI`, `GHOST_KV`), `SessionId` type, and data model interfaces (`AwayState`, `Reminder`, `ScreenName`). *(design §1.4, §4.2)*
- [x] **1.5** Create `src/worker.ts` with a `fetch` handler that routes `GET /` → serves `public/index.html` via `env.ASETS`, and returns 404 for everything else. *(US-7.3)*
- [x] **1.6** Create `public/index.html` placeholder with title "SmarterGhost" and a single `<h1>SmarterGhost online</h1>`. *(US-1.1 — minimal)*
- [x] **1.7** Create `vitest.config.ts` with node environment, include patterns for `src/**/*.test.ts` and `test/**/*.test.ts`, and v8 coverage. *(design §8.6)*
- [ ] **1.8** Run `npx wrangler dev` locally, verify `GET /` returns the placeholder page. *(verification)*
- [x] **1.9** Run `npx wrangler deploy`, verify the deployed URL returns the placeholder page. *(verification — early deployability)*

---

## Phase 2 — Command Parser & Property-Based Tests

Goal: the pure-logic layer (input routing + duration parsing) fully tested
before any I/O or UI. These functions have no external dependencies, making
them ideal for property-based testing.

- [x] **2.1** Create `src/commands/parser.ts` with `routeInput(input): { kind: "command" | "ai"; command?: string; args?: string }` — trims input, checks for leading `/`, tokenizes command name + remainder. *(US-3.5, design §2.1–2.3)*
- [x] **2.2** Create `src/commands/registry.ts` with `CommandSpec`, `CommandContext`, `CommandResult` interfaces and a `COMMAND_REGISTRY: Map<string, CommandSpec>` (initially empty, populated in Phase 3). Include alias resolution. *(design §2.2, §2.4)*
- [x] **2.3** Create `src/commands/remind.ts` exporting `parseDuration(input: string): ParsedDuration` — regex-based tokenizer for `s/m/h/d` units, sums to milliseconds, validates 1s min / 30d max. Pure function, no I/O. *(US-5.1, design §2.5)*
- [x] **2.4** Write `src/commands/duration.test.ts` — unit tests: `30m`→1,800,000 ms, `1h30m`→5,400,000 ms, `2d4h`→187,200,000 ms, `""`→error, `"abc"`→error, `"0s"`→error, `"31d"`→error. *(US-5.1, design §8.2)*
- [x] **2.5** Write `src/commands/duration.property.test.ts` — property: valid tokens produce positive ms; combined durations sum; garbage input never succeeds; result never exceeds 30 days. *(US-5.1, design §8.3)*
- [x] **2.6** Write `src/commands/parser.test.ts` — unit tests for each known command: valid args, missing args, empty args, whitespace edge cases, unknown command → help. *(US-3.5, design §8.2)*
- [x] **2.7** Write `src/commands/parser.property.test.ts` — property: slash input always routes to command; non-slash always routes to AI; unknown command returns help; command names are case-insensitive. *(US-3.5, design §8.3)*
- [x] **2.8** Run `npm test` — all parser and duration tests must pass. *(verification)*

---

## Phase 3 — Bot Commands & AI Handler

Goal: implement every command handler, the KV adapter, and the AI streaming
handler. After this phase the Worker is feature-complete (minus UI polish).

### 3A — KV Adapter

- [x] **3.1** Create `src/kv.ts` with functions: `getReminders(kv, sessionId)`, `saveReminders(kv, sessionId, reminders)`, `addReminder(...)`, `cancelReminder(kv, sessionId, id)`, `getAwayState(kv, sessionId)`, `setAwayState(kv, sessionId, msg)`, `clearAwayState(kv, sessionId)`, `getScreenName(kv, sessionId)`, `setScreenName(kv, sessionId, name)`. Uses namespaced keys per design §4.1. *(US-4.1, US-5.1, US-5.4, US-5.5, design §4.1–4.3)*
- [x] **3.2** Write `src/kv.test.ts` using an in-memory mock implementing `KVNamespace` — test reminder create/list/cancel, away set/clear, TTL behaviour. *(US-5.1, US-5.4, design §8.2)*

### 3B — Utility Commands

- [x] **3.3** Create `src/commands/weather.ts` — geocode via Open-Meteo, fetch current conditions, map WMO weather codes to text, format output string. 5s `AbortController` timeout. *(US-3.1, design §6.1)*
- [x] **3.4** Write `src/commands/weather.test.ts` — test with mocked fetch responses: valid weather, geocode miss, API timeout. *(US-3.1, design §8.2)*
- [x] **3.5** Create `src/commands/wiki.ts` — fetch Wikipedia REST summary, truncate extract to ≤300 words on word boundaries, format with title + link. 404 fallback to search redirect. *(US-3.2, design §6.2)*
- [x] **3.6** Write `src/commands/wiki.test.ts` — test: valid summary, truncation at 300 words, 404 fallback, not-found message. *(US-3.2, design §8.2)*
- [x] **3.7** Create `src/commands/define.ts` — fetch Free Dictionary API, format multiple meanings with POS tags and phonetic. *(US-3.3, design §6.3)*
- [x] **3.8** Write `src/commands/define.test.ts` — test: valid entry with multiple meanings, 404 fallback, missing phonetic. *(US-3.3, design §8.2)*
- [x] **3.9** Create `src/commands/news.ts` — fetch HN Algolia front-page, format top 5 headlines with points + links. *(US-3.4, design §6.4)*
- [x] **3.10** Write `src/commands/news.test.ts` — test: valid response with 5 hits, empty results, API error. *(US-3.4, design §8.2)*

### 3C — Reminder & Away Commands

- [x] **3.11** Implement `/remind <duration> <message>` in `src/commands/remind.ts` — parse duration, generate 6-char base36 ID, store via `addReminder`, reply with human-readable due time. Handle `cancel <id>` and `list` subcommands. *(US-5.1, US-5.3, US-5.4, design §2.6, §4.4)*
- [x] **3.12** Write `src/commands/remind.test.ts` — test: valid reminder creation, cancel by ID, list sorting by due time, invalid duration error, missing message error. *(US-5.1, US-5.3, US-5.4)*
- [x] **3.13** Create `src/commands/away.ts` — `/away <msg>` persists away state in KV and returns confirmation; `/back` clears away state and returns in-character welcome-back. *(US-4.1, US-4.3, design §2.4)*
- [x] **3.14** Write `src/commands/away.test.ts` — test: set away, clear away, away with no message, back when not away. *(US-4.1, US-4.3)*

### 3D — Help & Registry Population

- [x] **3.15** Create `src/commands/help.ts` — generate help text listing all registered commands with descriptions. Used as fallback for unknown commands. *(US-3.5)*
- [x] **3.16** Populate `COMMAND_REGISTRY` with all commands + aliases (`/w`, `/wk`, `/d`, `/n`, `/r`, `/h`, `/?`). *(design §2.4)*

### 3E — AI Handler

- [x] **3.17** Create `src/ai.ts` with `streamAIResponse(env, messages, sessionId)` — builds Llama message array with system prompt persona, calls `env.AI.run("@cf/meta/llama-3.1-8b-instruct", { stream: true, max_tokens: 512 })`, transforms to SSE. *(US-2.1, US-2.2, design §5.1–5.2)*
- [x] **3.18** Define system prompt constant with the SmarterGhost persona (playful, retro, concise, no markdown). *(US-2.2, design §5.2)*
- [x] **3.19** Implement `transformToSSE(stream)` — converts Workers AI `ReadableStream` into SSE-formatted `token`/`done`/`error` events per design §5.3. *(US-2.1, US-2.4, design §5.3)*
- [x] **3.20** Write `src/ai.test.ts` — test SSE transform with a mocked ReadableStream; verify event format and error handling. *(US-2.1, design §8.2)*

### 3F — Worker Route Wiring

- [x] **3.21** Wire `POST /api/chat` in `worker.ts` — read `X-Session-Id`, parse input via `routeInput`, dispatch to command handler or AI handler, return SSE stream. Auto-clear away status on any user message. *(US-2.1, US-3.1–3.5, US-4.2, design §1.2)*
- [x] **3.22** Wire `POST /api/away` in `worker.ts` — set/clear away status via KV adapter. *(US-4.1, design §1.2)*
- [x] **3.23** Wire `GET /api/poll-reminders` in `worker.ts` — SSE endpoint that reads reminders, emits due reminders every 15s, removes fired reminders from KV. *(US-5.2, US-5.5, design §1.2, §4.4)*
- [x] **3.24** Write `src/worker.test.ts` — unit tests for route dispatching (mock env bindings). *(design §8.2)*
- [x] **3.25** Run `npm test` — all unit tests pass. Then run `npx wrangler dev` and manually test `/api/chat` with `curl`. *(verification)*

---

## Phase 4 — Retro AIM UI

Goal: the full frontend — faithful AIM visual styling, chat with streaming,
buddy list, away banner, sounds, and mobile responsiveness.

### 4A — HTML Shell & CSS

- [x] **4.1** Replace `public/index.html` with the SPA shell: container divs for BuddyList, ChatWindow, andAwayBanner, script tag for `app.js`. *(US-1.1)*
- [x] **4.2** Create `public/aim.css` with CSS custom properties for the AIM palette (blues, yellows, grays, beige bg), font stack (Tahoma/Verdana/MS Sans Serif), and Win95 window chrome styling (2px outset borders, gradient title bars, min/close buttons). *(US-1.1, US-1.4, design §3.3)*
- [x] **4.3** Add `@media (max-width: 768px)` rules: buddy list and chat stack vertically, buddy list collapses to 40px header. *(US-6.1, design §3.4)*

### 4B — Frontend Build Setup

- [x] **4.4** Configure an esbuild/bundler step in `package.json` to compile `src/ui/*.ts` → `public/app.js` (ESM, target ES2022). Add `build:ui` script. *(infra)*
- [x] **4.5** Create `src/ui/App.ts` — root component that instantiates BuddyList, ChatWindow, AwayMessageBanner, ChatInputBar, SoundToggle; manages shared state (session ID, away status, screen name). *(design §3.1)*

### 4C — UI Components

- [x] **4.6** Create `src/ui/BuddyList.ts` — renders buddy list window with Online/Away/Offline groups, Win95 chrome, SmarterGhost always online, user's screen name moves to Away group when away. Double-click bot opens chat window. *(US-1.1, US-1.2, US-4.4, design §3.2)*
- [x] **4.7** Create `src/ui/ChatWindow.ts` — chat window with blue header, transcript area, typing indicator ("SmarterGhost is typing…"), `appendMessage` and `appendPartial` methods for streaming. User messages in blue, bot in black, AIM-style timestamps (HH:MM 12-hour). *(US-1.1, US-1.3, US-2.4, design §3.2, §5.4)*
- [x] **4.8** Create `src/ui/ChatInputBar.ts` — yellow AIM input bar, fires `onSend(text)` on Enter or Send button. Uses `position: sticky; bottom: 0` + `visualViewport` API on mobile. Minimum 14px font. *(US-1.3, US-6.2, US-6.3, design §3.2, §3.4)*
- [x] **4.9** Create `src/ui/AwayMessageBanner.ts` — thin yellow banner at top of chat window shown when user is away, displays away message text. *(US-4.4, design §3.2)*
- [x] **4.10** Create `src/ui/SoundToggle.ts` — opt-in toggle button (default off) for retro AIM sounds. Uses `Audio` API. *(US-1.4, design §3.3)*

### 4D — Client-Side Logic

- [x] **4.11** Implement session management in `App.ts` — generate UUID, store in `localStorage`, send as `X-Session-Id` on all API calls. Auto-generate on first load. *(design §1.4, §4.1)*
- [x] **4.12** Implement `streamChat(text)` in `ChatWindow.ts` — POST to `/api/chat` with text + last 10 messages as history, parse SSE stream, call `appendPartial` for `token` events, clear typing indicator on `done`, show fallback on `error`. *(US-2.1, US-2.3, US-2.4, US-5.6, design §5.4–5.6)*
- [x] **4.13** Implement client-side conversation history in `localStorage` — store last N messages, send with each request, no server-side persistence. *(design §5.6)*
- [x] **4.14** Implement reminder polling in `App.ts` — open SSE connection to `/api/poll-reminders`, display due reminders in chat window, play alert sound if enabled. Reconnect on drop. *(US-5.2, US-5.5, design §4.4)*
- [x] **4.15** Implement away-status UI sync — when `/away` or `/back` is used, update BuddyList grouping, show/hide AwayMessageBanner, POST to `/api/away`. Auto-clear away on any sent message. *(US-4.1, US-4.2, US-4.3, US-4.4)*
- [ ] **4.16** Build `app.js` via the bundler and verify it loads in the browser with `npx wrangler dev`. *(verification)*

---

## Phase 5 — Polish & Hardening

Goal: error handling, rate-limit degradation, cache headers, sound assets,
integration tests, and final verification.

- [x] **5.1** Implement in-character fallback messages for all error categories (AI error/timeout, rate-limited, external API failures, KV errors, parse errors) in a shared `src/fallbacks.ts`. Wire into all command handlers and AI handler. *(US-2.3, US-7.2, design §7.1–7.2)*
- [x] **5.2** Implement rate-limit degradation for Workers AI 429 — catch error, emit SSE `error` event with `ai_rate_limited` fallback, show "Try again" button in chat. No auto-retry. *(US-7.2, design §7.3)*
- [x] **5.3** Implement KV write-failure graceful degradation — reminder creation echoes text even if KV fails, away status falls back to client-side. *(US-7.2, design §7.3)*
- [x] **5.4** Set `Cache-Control: public, max-age=3600, s-maxage=86400` on static asset responses in the Worker. *(US-7.3, design §1.2)*
- [x] **5.5** Add `AbortController` with 5s timeout (`fetchWithTimeout`) to all external API calls (weather, wiki, define, news). Add `User-Agent: SmarterGhost/1.0` header. *(US-7.1, design §7.4–7.5)*
- [x] **5.6** Create or source `public/assets/sounds/im_receive.wav` and `door_open.wav` — short retro AIM sounds. *(US-1.4, design §3.3)*
- [x] **5.7** Create `public/assets/icons/` with `buddy_online.png`, `buddy_away.png`, `buddy_offline.png` — small period-appropriate status icons. *(US-1.1, design §3.3)*
- [x] **5.8** Write `test/integration.test.ts` using `unstable_dev` — test: serves index page, returns SSE for chat, handles `/weather`, handles `/remind` round-trip via KV. *(US-2.1, US-3.1, US-5.1, design §8.4)*
- [x] **5.9** Run full test suite `npm test` — all unit + property + integration tests pass. *(verification)*
- [ ] **5.10** Run `npx wrangler deploy` and manually verify all features on the deployed URL: chat, slash commands, reminders, away messages, mobile layout, sounds toggle. *(verification — final deployability)*
