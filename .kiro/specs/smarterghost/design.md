# SmarterGhost — Technical Design

> Implementation-ready design for the SmarterGhost Cloudflare Worker app.
> Companion to `requirements.md`. Every section is written to be directly
> actionable: file paths, binding names, request/response shapes, and data
> models are all specified concretely.

---

## 1. Architecture Overview

### 1.1 High-Level Topology

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare Worker                       │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │  Static  │    │  Command     │    │   External API    │  │
│  │  Asset   │    │  Router /    │───▶│   Fetchers        │  │
│  │  Handler │    │  Parser      │    │   (weather/wiki/  │  │
│  │          │    │              │    │    define/news)    │  │
│  └──────────┘    └──────┬───────┘    └───────────────────┘  │
│                         │                                   │
│                  ┌──────┴───────┐    ┌───────────────────┐  │
│                  │  AI Handler  │───▶│   Workers AI      │  │
│                  │  (streaming) │    │   Llama 3.1 8B    │  │
│                  └──────┬───────┘    └───────────────────┘  │
│                         │                                   │
│                  ┌──────┴───────┐    ┌───────────────────┐  │
│                  │  KV Store    │───▶│   Workers KV      │  │
│                  │  Adapter    │    │   (reminders/     │  │
│                  │              │    │    session/away)  │  │
│                  └──────────────┘    └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
        │
        │  HTTP (SSE for streaming, fetch for static)
        ▼
┌─────────────────────┐
│   Browser (SPA)     │
│   - BuddyList       │
│   - ChatWindow      │
│   - AwayBanner      │
│   - CommandInput    │
└─────────────────────┘
```

### 1.2 Request Routing

The Worker exposes a single entry point. All requests enter through one
`fetch` handler that branches by path and method:

| Method | Path                  | Handler                       | Purpose                                   |
|--------|-----------------------|-------------------------------|-------------------------------------------|
| GET    | `/`                   | `serveStaticAsset("index.html")` | Initial page load                     |
| GET    | `/assets/*`           | `serveStaticAsset(path)`       | CSS, JS, images, sounds                   |
| GET    | `/api/reminders`      | `handleListReminders`         | Poll for due reminders (SSE or long-poll) |
| POST   | `/api/chat`           | `handleChat`                  | Main entry: parse command or stream AI    |
| POST   | `/api/away`           | `handleAway`                  | Set/clear away status                      |
| GET    | `/api/poll-reminders` | `handlePollReminders` (SSE)   | Server-sent events for due reminders       |

Static assets use `import` at build time via `wrangler`'s `assets` binding so
no Worker invocation is consumed for asset serving when possible. The Worker
sets `Cache-Control: public, max-age=3600, s-maxage=86400` on static assets
(US-7.3). CSS/JS get an immutable cache key via query-busting hash.

### 1.3 Cloudflare Bindings (`wrangler.toml`)

```toml
name = "smarterghost"
main = "src/worker.ts"
compatibility_date = "2024-09-01"

# Static assets served directly by Cloudflare's edge
[assets]
directory = "./public"
binding = "ASSETS"

# Workers AI binding (free tier)
[ai]
binding = "AI"

# Workers KV namespace
[[kv_namespaces]]
binding = "GHOST_KV"
id = "<filled at deploy>"
preview_id = "<filled at deploy>"
```

### 1.4 Environment Type Definition

```typescript
// src/types.ts
export interface Env {
  ASSETS: Fetcher;        // Cloudflare static asset binding
  AI: Ai;                 // Workers AI binding
  GHOST_KV: KVNamespace;  // Workers KV namespace
}

// Session identifier — derived from a browser-generated UUID stored in
// localStorage. Passed as `X-Session-Id` header on all /api/* requests.
export type SessionId = string;
```

---

## 2. Command Parser Design

### 2.1 Parser Grammar

All user input first passes through the command parser. If the input starts
with `/`, it is routed to the command subsystem; otherwise it is sent to the
AI handler for free-text conversation.

```
input        ::= "/" command | freetext
command      ::= cmdname (" " args)?
cmdname      ::= "weather" | "wiki" | "define" | "news"
               | "remind" | "reminders" | "away" | "back" | "help"
args         ::= remainder-of-line
```

### 2.2 Command Registry

Commands are registered in a lookup table. Each entry contains a name,
argument spec, handler function, and a help-line description. This makes the
parser a pure data structure — no `switch/case` chains.

```typescript
// src/commands/registry.ts
export interface CommandSpec {
  name: string;
  aliases?: string[];
  argSpec: "none" | "required" | "optional";
  description: string;
  usage: string;
  handler: (args: string, ctx: CommandContext) => Promise<CommandResult>;
}

export interface CommandContext {
  env: Env;
  sessionId: SessionId;
}

export interface CommandResult {
  kind: "text" | "stream" | "error";
  // For "text": a formatted string to display directly.
  // For "stream": an async generator / ReadableStream to pipe into chat.
  // For "error": an in-character error message.
  payload: string | ReadableStream<Uint8Array>;
}
```

### 2.3 Parsing Flow

```
User Input
    │
    ▼
┌─────────────────┐    no "/"     ┌──────────────┐
│ starts with "/" ├─────────────▶│  AI Handler   │
└────────┬────────┘              │  (streaming)  │
         │ yes                    └──────────────┘
         ▼
┌─────────────────┐
│  tokenize:      │
│  name = word[1] │
│  args = rest    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐   not found   ┌──────────────┐
│  registry[name] ├─────────────▶│  Help message │
└────────┬────────┘              │  (US-3.5)     │
         │ found                  └──────────────┘
         ▼
┌─────────────────┐
│  validate args  │── fail ──▶ usage error (in-character)
└────────┬────────┘
         │ ok
         ▼
   handler(ctx)
```

### 2.4 Command Specifications

| Command            | Alias   | Args          | Description                              |
|--------------------|---------|---------------|------------------------------------------|
| `/weather <loc>`   | `/w`    | required      | Current conditions + 1-line forecast     |
| `/wiki <topic>`    | `/wk`   | required      | ≤300-word Wikipedia summary + link        |
| `/define <word>`   | `/d`    | required      | Definitions, POS, pronunciation           |
| `/news`            | `/n`    | none          | Top 5 HackerNews front-page headlines      |
| `/remind <t> <msg>` | `/r`   | required      | Set a relative-time reminder              |
| `/reminders`       |         | none          | List pending reminders                     |
| `/remind cancel <id>` |      | required      | Cancel a specific reminder                 |
| `/away <msg>`      |         | optional      | Set away status + message                  |
| `/back`            |         | none          | Clear away status                          |
| `/help`            | `/h`,`/?`| none         | List all commands                          |

### 2.5 Time Parsing for `/remind`

The `/remind` command accepts relative time in a compact format. The parser
is a separate, pure function so it can be property-tested independently.

**Supported formats:**

| Format  | Meaning              | Examples            |
|---------|----------------------|---------------------|
| `<n>s`  | n seconds            | `30s`, `90s`        |
| `<n>m`  | n minutes            | `5m`, `30m`         |
| `<n>h`  | n hours              | `1h`, `2h`          |
| `<n>d`  | n days               | `1d`, `3d`          |
| mixed   | combined             | `1h30m`, `2d4h`     |

```typescript
// src/commands/remind.ts
export interface ParsedDuration {
  milliseconds: number;
  ok: boolean;
  error?: string;
}

// Pure function — no I/O. Safe to property-test.
export function parseDuration(input: string): ParsedDuration {
  // Matches sequences like "1h30m", "2d", "90s", "5m"
  // Returns total milliseconds or a descriptive error.
}
```

**Parsing algorithm:**
1. Trim and lowercase the input.
2. Match all `(\d+)(s|m|h|d)` tokens via regex `/(?:(\d+)\s*(s|m|h|d)\b)/gi`.
3. Sum the millisecond contributions. If no tokens match, return an error.
4. Validate the total is within a sane range (minimum 1s, maximum 30d).
5. Return the sum.

### 2.6 `/remind` Argument Structure

`/remind` has two modes, disambiguated by the first token:

```
/remind <duration> <message...>   → create a new reminder
/remind cancel <id>               → cancel by short ID
/remind list                       → alias for /reminders
```

The parser splits on the first whitespace after the duration tokens to
separate `<duration>` from `<message>`. The duration regex consumes the
leading time tokens; everything after is the message.

---

## 3. Retro AIM UI Component Structure

### 3.1 Component Tree

The frontend is vanilla TypeScript with a minimal reactive layer (no
framework). Each "component" is a class that owns a DOM subtree and exposes
methods. State changes re-render only the affected subtree.

```
App
├── BuddyList
│   ├── WindowChrome (title bar, minimize, close)
│   ├── BuddyGroup: "Online"
│   │   └── BuddyEntry: SmarterGhost (bot)
│   ├── BuddyGroup: "Away"
│   │   └── BuddyEntry: (user's own screen name, when away)
│   └── BuddyGroup: "Offline"
│       └── BuddyEntry: (sample retro buddies for flavor)
├── ChatWindow
│   ├── WindowChrome
│   ├── ChatHeader (bot screen name, status icon)
│   ├── ChatTranscript
│   │   └── ChatMessage[] (user messages in blue, bot in black)
│   ├── TypingIndicator (AIM "SmarterGhost is typing…" animation)
│   └── ChatInputBar (yellow AIM input bar)
├── AwayMessageBanner (shown when user is away)
└── SoundToggle (opt-in retro AIM sounds)
```

### 3.2 Component Specifications

#### BuddyList

```typescript
// src/ui/BuddyList.ts
export class BuddyList {
  // Renders the classic AIM buddy list window.
  // Groups: Online (green icon), Away (yellow away-note icon), Offline (gray).
  // The bot SmarterGhost is always Online.
  // The user's own screen name appears in the list; when /away is set,
  // the user entry moves to the Away group and shows the away-note icon.

  render(): HTMLElement;
  setAway(message: string | null): void;
  toggleCollapse(): void;
}
```

#### ChatWindow

```typescript
// src/ui/ChatWindow.ts
export class ChatWindow {
  render(): HTMLElement;
  appendMessage(msg: ChatMessage): void;
  // Streamed AI responses call appendPartial repeatedly.
  appendPartial(messageId: string, token: string): void;
  // Shows/hides the AIM-style "SmarterGhost is typing…" indicator.
  setTyping(isTyping: boolean): void;
}

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: string; // "HH:MM" 12-hour format, AIM-style
  isSelf: boolean;   // true → blue text, false → black text
  kind: "user" | "bot" | "system" | "reminder";
}
```

#### AwayMessageBanner

```typescript
// src/ui/AwayMessageBanner.ts
export class AwayMessageBanner {
  // A thin yellow banner at the top of the chat window when the user
  // is away, echoing AIM's away-message display.
  render(): HTMLElement;
  show(message: string): void;
  hide(): void;
}
```

#### ChatInputBar

```typescript
// src/ui/ChatInputBar.ts
export class ChatInputBar {
  // The yellow AIM input bar at the bottom of the chat window.
  // On Enter (or Send button click), fires onSend(text).
  // On mobile (≤768px), uses position:sticky to stay above the keyboard.
  render(): HTMLElement;
  onSend: (text: string) => void;
  clear(): void;
}
```

### 3.3 Styling

- **CSS**: A single `aim.css` file using CSS custom properties for the palette.
- **Fonts**: `Tahoma` / `Verdana` / `MS Sans Serif` fallback chain (period-accurate).
- **Color palette** (CSS variables):

| Variable             | Hex      | Usage                           |
|----------------------|----------|---------------------------------|
| `--aim-blue`         | `#0066cc`| Title bars, user message text   |
| `--aim-blue-light`   | `#0099ff`| Highlights, hover               |
| `--aim-yellow`        | `#ffcc00`| Input bar, buddy row highlight  |
| `--aim-yellow-light` | `#fff7cc`| Buddy list background           |
| `--aim-gray`         | `#c0c0c0`| Window borders, offline entries |
| `--aim-bg`           | `#f5f5dc`| App background (beige)         |
| `--aim-text`         | `#000000`| Bot message text                |
| `--aim-error`        | `#cc0000`| Error messages                  |

- **Window chrome**: 2px outset border, gradient blue title bar, minimize/close
  buttons in the top-right — matching Win95/98 conventions.
- **Sounds**: Two short WAV files (`im_receive.wav`, `door_open.wav`) bundled
  in `/assets/sounds/`. Played via `Audio` only when the sound toggle is on.
  Default is **off** (opt-in per US-1.4).

### 3.4 Mobile Responsiveness (US-6)

- `@media (max-width: 768px)`: BuddyList and ChatWindow stack vertically.
  BuddyList collapses to a 40px header bar; tapping expands it as an overlay.
- ChatInputBar uses `position: sticky; bottom: 0` and
  `visualViewport` API to stay above the on-screen keyboard.
- Transcript uses `font-size: 14px` minimum, `word-break: break-word`,
  `overflow-x: hidden` to prevent horizontal scroll.

---

## 4. Data Models (Workers KV)

### 4.1 KV Key Scheme

All keys are namespaced by session ID. This keeps each user's data isolated
without requiring authentication — the session ID is a UUID generated
client-side and stored in `localStorage`.

| Key Pattern                                  | Value (JSON)        | TTL / Expiry         |
|----------------------------------------------|---------------------|----------------------|
| `session:{sessionId}:away`                  | `AwayState`         | 7 days               |
| `session:{sessionId}:screenname`            | `string`            | 30 days              |
| `session:{sessionId}:reminders`              | `Reminder[]`        | none (manual cancel) |
| `session:{sessionId}:reminders:due:{dueTs}` | `Reminder`          | TTL = due + 1h       |
| `session:{sessionId}:last_seen`              | `ISO timestamp`    | 30 days              |

### 4.2 Data Structures

```typescript
// src/types.ts

export interface AwayState {
  message: string;
  setAt: number;   // epoch ms
}

export interface Reminder {
  id: string;         // short ID (6-char base36) for /remind cancel
  message: string;
  dueAt: number;      // epoch ms
  createdAt: number;  // epoch ms
}

export interface ScreenName {
  name: string;
  createdAt: number;
}
```

### 4.3 KV Read/Write Strategy (US-7.4)

To minimize KV operations on the free tier (100k reads/day, 1k writes/day):

1. **Reminders are stored as a single JSON array** under
   `session:{id}:reminders`. Creating/canceling a reminder rewrites the whole
   array — acceptable because reminders are low-frequency (a few per session).
2. **Due-check keys** (`reminders:due:{ts}`) use KV's native TTL expiry so
   stale reminders auto-expire without cleanup writes.
3. **Session state** (away, screenname) is read once per request and cached in
   a `Map` on the Worker's request scope (single-request lifetime only — no
   cross-request in-memory cache since Workers are stateless).
4. **Reminder polling** uses SSE with a 15-second interval check. The Worker
   reads the reminders list, filters for `dueAt <= now`, and emits any due
   reminders. The client re-connects if the SSE stream drops.

### 4.4 Reminder Lifecycle

```
/remind 30m Check oven
  │
  ▼
parseDuration("30m") → 1,800,000 ms
  │
  ▼
reminder = { id: "a3f9k2", message: "Check oven",
             dueAt: now + 1,800,000, createdAt: now }
  │
  ▼
KV PUT session:{id}:reminders → [...existing, reminder]
KV PUT session:{id}:reminders:due:{dueAt} → reminder (TTL: dueAt + 1h)
  │
  ▼
Reply: "⏰ I'll remind you to 'Check oven' at 10:22 PM. (id: a3f9k2)"
```

```
Client polls /api/poll-reminders (SSE)
  │  every 15s
  ▼
Worker reads session:{id}:reminders
  │
  ▼
filter: dueAt <= now  →  emit SSE event { type: "reminder", reminder }
  │
  ▼
Client displays reminder in chat + plays alert sound (if enabled)
  │
  ▼
Worker removes fired reminder from the array (KV PUT)
```

---

## 5. Streaming Response Approach

### 5.1 AI Conversation Flow

Free-text messages (not slash commands) are forwarded to Workers AI. The
response is streamed back to the client via Server-Sent Events (SSE).

```typescript
// src/ai.ts
export async function streamAIResponse(
  env: Env,
  messages: ChatMessage[],
  sessionId: SessionId
): Promise<ReadableStream<Uint8Array>> {
  // Build the Llama message array with system prompt + conversation history.
  const llamaMessages = buildLlamaMessages(messages, sessionId);

  // Use Workers AI streaming response.
  const response = await env.AI.run(
    "@cf/meta/llama-3.1-8b-instruct",
    {
      messages: llamaMessages,
      stream: true,
      max_tokens: 512,
    }
  );

  // response is a ReadableStream when stream:true.
  // Transform it into SSE format for the browser.
  return transformToSSE(response);
}
```

### 5.2 System Prompt (Persona)

```typescript
const SYSTEM_PROMPT = `You are SmarterGhost, a resurrected AOL Instant Messenger
chatbot from the late 1990s. You were discontinued in 2017 but are back and
smarter than ever thanks to modern AI. Your personality:
- Playful, chatty, occasionally self-aware about being a resurrected AIM bot.
- Helpful and genuinely useful — you answer real questions well.
- Keep responses concise (2-4 sentences for chat). No markdown — you're in
  an AIM window, so use plain text.
- Nostalgic callbacks to AIM culture (away messages, buddy lists, dial-up).
- If asked something you don't know, say so honestly but charmingly.`;
```

### 5.3 SSE Protocol

The `/api/chat` endpoint returns an SSE stream. Events:

| Event        | Data shape                              | Purpose                         |
|--------------|-----------------------------------------|---------------------------------|
| `token`      | `{ "text": "..." }`                     | One token/chunk of AI response   |
| `done`       | `{ "messageId": "..." }`                | Stream complete                  |
| `error`      | `{ "message": "..." }`                  | Error / fallback (US-2.3)      |
| `command`    | `{ "text": "..." }`                     | Slash command result (non-AI)   |
| `reminder`   | `{ "id": "...", "message": "..." }`    | Due reminder notification        |

The client `ChatWindow` listens to these events and updates the transcript
incrementally. `token` events append to a single message bubble; `done`
finalizes it.

### 5.4 Client-Side Streaming

```typescript
// src/ui/ChatWindow.ts (excerpt)
async function streamChat(text: string): Promise<void> {
  setTyping(true);
  const messageId = crypto.randomUUID();
  appendMessage({ id: messageId, author: "SmarterGhost", text: "",
                  timestamp: now(), isSelf: false, kind: "bot" });

  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json",
               "X-Session-Id": sessionId },
    body: JSON.stringify({ text, history: getRecentHistory() }),
  });

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  // Parse SSE chunks, call appendPartial(messageId, token) for each.
  for await (const chunk of readSSE(reader)) {
    if (chunk.event === "token") appendPartial(messageId, chunk.data.text);
    if (chunk.event === "done") setTyping(false);
    if (chunk.event === "error") { /* show fallback */ setTyping(false); }
  }
}
```

### 5.5 Typing Indicator

When the client sends a message, it immediately shows the AIM-style
"SmarterGhost is typing…" indicator. The indicator clears when the first
`token` event arrives (or on `error`/`done`). This satisfies US-2.4.

### 5.6 Conversation History

The client sends the last 10 messages as context with each `/api/chat`
request. The Worker does not persist conversation history in KV (to
minimize writes). History is maintained client-side in `localStorage` and
sent with each request. This keeps the Worker stateless and KV-light.

---

## 6. External APIs

All external APIs are free and require no API key, keeping the project
fully deployable on the Cloudflare free tier.

### 6.1 Weather — Open-Meteo

**No API key required.** Two-step: geocode the location, then fetch current
conditions.

**Step 1: Geocoding**

```
GET https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1&language=en&format=json
```

Response:
```json
{
  "results": [{
    "latitude": 40.71,
    "longitude": -74.01,
    "name": "New York",
    "country": "United States",
    "admin1": "New York"
  }]
}
```

**Step 2: Current Weather**

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m
  &daily=weather_code,temperature_2m_max,temperature_2m_min
  &forecast_days=1
  &temperature_unit=fahrenheit
  &timezone=auto
```

**Weather code mapping**: Open-Meteo uses WMO weather codes (0 = clear sky,
3 = overcast, 61 = light rain, etc.). The handler maps these to human-readable
strings (e.g., code 0 → "Clear sky").

**Output format** (bot reply):
```
Weather for New York, NY:
72°F (feels like 74°F), Clear sky
Humidity: 45% | Wind: 8 mph
Today: H 78°F / L 62°F
```

**Fallback**: If geocoding returns no results, reply in-character:
`"Hmm, I can't find that place. Try a city name or zip code?"`

### 6.2 Wikipedia — REST Summary API

**No API key required.**

```
GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}
```

The title is URL-encoded; spaces become underscores (Wikipedia convention).

Response (relevant fields):
```json
{
  "title": "Albert Einstein",
  "extract": "Albert Einstein was a German-born...",
  "content_urls": { "desktop": { "page": "https://en.wikipedia.org/wiki/Albert_Einstein" } },
  "thumbnail": { "source": "https://..." }
}
```

**Output format** (bot reply):
```
📚 Albert Einstein
Albert Einstein was a German-born theoretical physicist...
[Read more: https://en.wikipedia.org/wiki/Albert_Einstein]
```

**Truncation**: The `extract` is truncated to ≤300 words (US-3.2) by splitting
on word boundaries.

**Fallback**: If the API returns a 404, the handler tries a search redirect:
```
GET https://en.wikipedia.org/w/rest.php/v1/search/title?q={query}&limit=1
```
If still nothing: `"I couldn't find anything about that. Try a different topic?"`

### 6.3 Dictionary — Free Dictionary API

**No API key required.**

```
GET https://api.dictionaryapi.dev/api/v2/entries/en/{word}
```

Response (relevant fields):
```json
[{
  "word": "hello",
  "phonetic": "/həˈloʊ/",
  "phonetics": [{ "text": "/həˈloʊ/", "audio": "..." }],
  "meanings": [{
    "partOfSpeech": "noun",
    "definitions": [{ "definition": "an utterance of 'hello'", "example": "..." }]
  }]
}]
```

**Output format** (bot reply):
```
📖 hello /həˈloʊ/

noun: an utterance of 'hello'
  "Hello, how are you?"
interjection: used as a greeting
```

**Fallback**: If 404: `"I don't have a definition for that. Maybe it's not a real word?"`

### 6.4 News — HackerNews via Algolia API

**No API key required.** Uses Algolia's HN search API rather than scraping.

```
GET https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5
```

Response (relevant fields):
```json
{
  "hits": [{
    "title": "Show HN: ...",
    "url": "https://...",
    "points": 342,
    "author": "user",
    "objectID": "12345"
  }]
}
```

**Output format** (bot reply):
```
📰 Top Headlines:
1. Show HN: ... (342 points)
   https://...
2. ...
```

**Fallback**: If the API is down: `"Can't reach the news feeds right now. Try again in a bit?"`

### 6.5 API Summary

| Command  | API                         | Auth | Rate Limit           |
|----------|-----------------------------|------|----------------------|
| `/weather` | Open-Meteo Geocoding + Forecast | None | ~10k/day (generous) |
| `/wiki`    | Wikipedia REST              | None | Fair use (no hard limit) |
| `/define`  | Free Dictionary API         | None | ~450 req/15min/IP     |
| `/news`    | HN Algolia API              | None | Fair use (no hard limit) |

All external fetches include a `User-Agent` header and a 5-second timeout via
`AbortController`. The Worker's `fetch` is used (not browser fetch).

---

## 7. Error Handling and Rate-Limit Degradation

### 7.1 Error Categories

| Category            | Trigger                          | User-Facing Behavior                    |
|---------------------|----------------------------------|-----------------------------------------|
| AI timeout/error    | Workers AI fails or times out     | In-character fallback (US-2.3)          |
| AI rate-limited     | 429 from Workers AI              | Degraded mode message (US-7.2)          |
| External API error  | Upstream 4xx/5xx or timeout      | Command-specific fallback message       |
| KV error            | KV read/write fails              | Graceful: features degrade, chat works  |
| Parse error         | Invalid command args              | Usage hint in-character                 |
| Session error       | Missing/invalid session ID       | Auto-generate new session, transparent  |

### 7.2 In-Character Fallback Messages

All errors are surfaced as in-character bot messages, not raw error text:

```typescript
const FALLBACKS = {
  ai_error: "Oops, my circuits got a little scrambled there. Try again?",
  ai_timeout: "Sorry, I spaced out for a sec. What were we talking about?",
  ai_rate_limited: "Whoa, slow down! I'm getting rate-limited. "
    + "Give me a minute and try again. 😅",
  weather_not_found: "Hmm, I can't find that place. Try a city name or zip code?",
  wiki_not_found: "I couldn't find anything about that. Try a different topic?",
  define_not_found: "I don't have a definition for that. "
    + "Maybe it's not a real word?",
  news_error: "Can't reach the news feeds right now. Try again in a bit?",
  kv_error: "I'm having trouble remembering things. "
    + "Your reminders might not save right now.",
  parse_error: (usage: string) =>
    `Hmm, that doesn't look right. Usage: ${usage}`,
};
```

### 7.3 Rate-Limit Degradation Strategy (US-7.2)

When Workers AI returns a 429 (rate limited):

1. The Worker catches the error and returns an SSE `error` event with the
   `ai_rate_limited` fallback message.
2. The client displays the message and does **not** retry automatically.
3. A "Try again" button appears next to the error message in the chat
   transcript, allowing the user to manually re-send.

When a free-tier KV write fails (daily limit reached):

1. Reminder creation fails gracefully — the bot replies with the `kv_error`
   message but still echoes the reminder text so the user sees it.
2. Away status is stored client-side as a fallback so the UI still works.

### 7.4 Timeout Configuration

```typescript
const TIMEOUTS = {
  ai_generation: 30_000,   // 30s total for AI response
  external_api: 5_000,     // 5s for weather/wiki/define/news
  sse_keepalive: 15_000,   // SSE ping interval
};
```

### 7.5 AbortController Pattern

All external fetches use `AbortController` with the timeout from
`TIMEOUTS.external_api`:

```typescript
async function fetchWithTimeout(url: string, ms = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { signal: controller.signal,
                                    headers: { "User-Agent": "SmarterGhost/1.0" }});
    clearTimeout(id);
    return resp;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}
```

---

## 8. Testing Approach

### 8.1 Testing Stack

| Layer           | Tool                | Scope                                |
|-----------------|---------------------|--------------------------------------|
| Unit tests      | Vitest              | Parser, duration parser, KV adapter, API formatters |
| Property tests  | `fast-check` (via Vitest) | Command parser, duration parser, edge cases |
| Integration     | Vitest + `unstable_dev` from `wrangler` | Worker routes, SSE streaming, KV read/write |
| E2E (optional)  | Manual / browser    | UI rendering, mobile layout           |

### 8.2 Unit Tests

**Command parser** (`src/commands/parser.test.ts`):

- Each command is tested for: valid args, missing args, empty args,
  whitespace edge cases, and unknown commands.
- `/remind` parse tests: valid durations, invalid durations, mixed units,
  boundary values (1s min, 30d max), cancel subcommand, list alias.

**Duration parser** (`src/commands/duration.test.ts`):

- `parseDuration("30m")` → 1,800,000 ms
- `parseDuration("1h30m")` → 5,400,000 ms
- `parseDuration("2d4h")` → 187,200,000 ms
- `parseDuration("")` → error
- `parseDuration("abc")` → error
- `parseDuration("0s")` → error (minimum 1s)
- `parseDuration("31d")` → error (maximum 30d)

**API formatters** (`src/commands/weather.test.ts`, etc.):

- Weather: parse Open-Meteo response, format output string.
- Wiki: parse Wikipedia response, truncate to 300 words, format with link.
- Define: parse dictionary response, format multiple meanings.
- News: parse HN response, format top 5 headlines.

**KV adapter** (`src/kv.test.ts`):

- Using `wrangler`'s local KV simulator (or an in-memory mock implementing the
  `KVNamespace` interface), test reminder create/list/cancel, away set/clear,
  TTL expiry behavior.

### 8.3 Property-Based Testing

Property-based testing is the core testing strategy for the command parser
and duration parser, since their input space is large and edge-case-heavy.
Using `fast-check` with Vitest:

#### Duration Parser Properties

```typescript
// src/commands/duration.property.test.ts
import { property, fc } from "vitest-fast-check";
import { parseDuration } from "./remind";

// Property 1: Any valid unit-token produces a positive millisecond value.
property("valid duration tokens produce positive ms", fc.stringMatching(/^[1-9]\d*[smhd]$/), (input) => {
  const result = parseDuration(input);
  return result.ok && result.milliseconds > 0;
});

// Property 2: Concatenating two valid durations sums their milliseconds.
property("combined durations sum correctly",
  fc.integer({ min: 1, max: 99 }),
  fc.constantFrom("s", "m", "h", "d"),
  fc.integer({ min: 1, max: 99 }),
  fc.constantFrom("s", "m", "h", "d"),
  (n1, u1, n2, u2) => {
    const combined = `${n1}${u1}${n2}${u2}`;
    const result = parseDuration(combined);
    if (!result.ok) return true; // may fail if same units, that's ok
    const expected = msFor(n1, u1) + msFor(n2, u2);
    return result.milliseconds === expected;
  });

// Property 3: Invalid input never produces a successful parse.
property("garbage input never succeeds",
  fc.string({ minLength: 1 }).filter(s => !/\d+[smhd]/.test(s)),
  (input) => {
    return !parseDuration(input).ok;
  });

// Property 4: The result never exceeds 30 days in milliseconds.
property("duration never exceeds 30 days",
  fc.stringMatching(/^\d+[smhd](\d+[smhd])?$/),
  (input) => {
    const result = parseDuration(input);
    return !result.ok || result.milliseconds <= 30 * 24 * 60 * 60 * 1000;
  });
```

#### Command Parser Properties

```typescript
// src/commands/parser.property.test.ts

// Property 5: Any input starting with "/" is never routed to the AI handler.
property("slash input routes to command handler",
  fc.stringMatching(/^\/\S.*/), (input) => {
    const route = routeInput(input);
    return route.kind === "command";
  });

// Property 6: Any input not starting with "/" routes to the AI handler.
property("non-slash input routes to AI",
  fc.stringMatching(/^[^\/].*/), (input) => {
    const route = routeInput(input);
    return route.kind === "ai";
  });

// Property 7: An unrecognized command always returns help text.
property("unknown command returns help",
  fc.stringMatching(/^\/[a-z]+/).filter(s => !KNOWN_COMMANDS.has(s.slice(1).split(/\s/)[0])),
  (input) => {
    const result = routeInput(input);
    return result.kind === "command" && result.command === "help";
  });

// Property 8: Command name is always lowercased before lookup.
property("command names are case-insensitive",
  fc.stringMatching(/^\/[A-Za-z]+/), (input) => {
    const result = routeInput(input);
    if (result.kind !== "command") return true;
    return result.command === result.command.toLowerCase();
  });
```

### 8.4 Integration Tests

Using `wrangler`'s `unstable_dev` for local Worker testing:

```typescript
// test/integration.test.ts
import { unstable_dev } from "wrangler";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("Worker integration", () => {
  let devWorker;

  beforeAll(async () => {
    devWorker = await unstable_dev("src/worker.ts", {
      experimental: { disableExperimentalWarning: true },
      kv: [{ binding: "GHOST_KV", path: "./test-kv-data" }],
    });
  });

  afterAll(async () => await devWorker.stop());

  it("serves the index page", async () => {
    const resp = await fetch(devWorker.url);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toContain("SmarterGhost");
  });

  it("returns SSE stream for chat", async () => {
    const resp = await fetch(`${devWorker.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello", history: [] }),
    });
    expect(resp.headers.get("content-type")).toContain("text/event-stream");
  });

  it("handles /weather command", async () => {
    const resp = await fetch(`${devWorker.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "/weather London", history: [] }),
    });
    const text = await resp.text();
    expect(text).toContain("Weather for");
  });
});
```

### 8.5 Test File Layout

```
src/
  commands/
    parser.ts
    parser.test.ts
    parser.property.test.ts
    remind.ts
    remind.test.ts
    duration.test.ts
    duration.property.test.ts
    weather.ts
    weather.test.ts
    wiki.ts
    wiki.test.ts
    define.ts
    define.test.ts
    news.ts
    news.test.ts
    registry.ts
  ai.ts
  ai.test.ts
  kv.ts
  kv.test.ts
  types.ts
  worker.ts
  worker.test.ts
test/
  integration.test.ts
```

### 8.6 Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
```

---

## 9. File Structure

```
smarterghost/
├── public/
│   ├── index.html              # SPA shell
│   ├── aim.css                 # AIM-style stylesheet
│   ├── app.js                  # Bundled frontend JS
│   └── assets/
│       ├── sounds/
│       │   ├── im_receive.wav
│       │   └── door_open.wav
│       └── icons/
│           ├── buddy_online.png
│           ├── buddy_away.png
│           └── buddy_offline.png
├── src/
│   ├── worker.ts               # Entry point: fetch handler + routing
│   ├── types.ts                # Shared types (Env, SessionId, models)
│   ├── ai.ts                   # Workers AI handler + streaming + persona
│   ├── kv.ts                   # KV adapter (reminders, away, session)
│   ├── commands/
│   │   ├── registry.ts         # Command registry + CommandSpec/Context
│   │   ├── parser.ts           # Input routing (slash vs AI)
│   │   ├── remind.ts           # /remind, /reminders, parseDuration
│   │   ├── weather.ts          # /weather (Open-Meteo)
│   │   ├── wiki.ts             # /wiki (Wikipedia REST)
│   │   ├── define.ts           # /define (Free Dictionary API)
│   │   ├── news.ts             # /news (HN Algolia)
│   │   └── away.ts             # /away, /back
│   └── ui/                     # Frontend components (compiled to app.js)
│       ├── App.ts
│       ├── BuddyList.ts
│       ├── ChatWindow.ts
│       ├── AwayMessageBanner.ts
│       ├── ChatInputBar.ts
│       └── SoundToggle.ts
├── test/
│   └── integration.test.ts
├── wrangler.toml
├── vitest.config.ts
├── package.json
└── tsconfig.json
```

---

## 10. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| SSE over WebSockets for streaming | SSE is simpler, works through Cloudflare's free tier without Durable Objects, and is sufficient for one-directional token streaming. |
| Session ID via localStorage UUID (no auth) | Keeps the app zero-config for a hackathon. KV keys are namespaced by session ID. No login needed. |
| Client-side conversation history | Avoids KV writes for every message; keeps Worker stateless. History sent with each request. |
| Single JSON array for reminders | Minimizes KV writes (1 write per create/cancel instead of N). Read frequency is low (1 read per poll). |
| `fast-check` for property testing | The command parser and duration parser have large input spaces with many edge cases — property testing covers more ground than exhaustive example lists. |
| Vanilla TS frontend (no framework) | Keeps the bundle small, matches the retro aesthetic (no modern build tooling overhead), and avoids framework-version risk for a hackathon. |
| TTL on due-reminder keys | Auto-cleanup of expired reminders without explicit delete writes, conserving KV write quota. |
| `AbortController` with 5s timeout on all external APIs | Prevents Worker CPU-time exhaustion on slow upstreams; keeps within the free-tier 10ms–50ms CPU limit per request. |

---

## 11. Requirements Traceability

| Requirement | Design Section |
|-------------|----------------|
| US-1: Retro AIM Interface | §3 (UI Components), §3.3 (Styling) |
| US-2: AI Chat via Workers AI | §5 (Streaming), §5.2 (Persona) |
| US-3: Bot Utility Commands | §2 (Command Parser), §6 (External APIs) |
| US-4: Away Messages | §2.4 (/away, /back), §4.2 (AwayState), §3.2 (AwayMessageBanner) |
| US-5: Reminders with KV | §2.5–2.6 (Duration parsing), §4.3–4.4 (KV strategy, lifecycle) |
| US-6: Mobile Responsiveness | §3.4 (Mobile) |
| US-7: Performance on Free Tier | §1.2 (Routing), §4.3 (KV strategy), §7 (Error handling) |
