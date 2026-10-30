# SmarterGhost — Hard Constraints

> These are non-negotiable constraints for the SmarterGhost project. Every
> contribution — code, UI, assets, docs, and video — MUST comply. If a change
> cannot satisfy a constraint, halt and discuss before proceeding.

---

## Constraint 1: Original IP Only

SmarterGhost is an original work inspired by the late-90s / early-2000s instant
messaging era. It is **not** affiliated with, endorsed by, or derived from any
existing product or brand.

### 1.1 Prohibited — Never Use

The following must **never** appear anywhere in this project — code, UI text,
CSS class names, asset file names, documentation, commit messages, or video:

- The name **AOL** or **America Online**.
- The name **AIM** or **AOL Instant Messenger** as a product/brand reference.
- The name **SmarterChild** or any variation (Smarterchild, smarter_child, etc.).
- Any trademarked logo, icon, sound file, screenshot, or copied asset from AOL,
  AIM, SmarterChild, or related properties.
- Any likeness, mascot, or visual element that reproduces a protected design.
- Any audio file ripped or sampled from an existing product.

> **Naming note:** Internal identifiers MAY use generic, non-trademarked terms
> for clarity (e.g. `aim-blue` as a CSS variable name is a color label, not a
> brand reference). However, user-facing strings, documentation, and any
> publicly visible content must use the original name **SmarterGhost** and
> avoid brand names entirely. When in doubt, use a neutral term.

### 1.2 Required — Original Assets

Everything user-facing must be original work created for this project:

- **Name:** SmarterGhost (our own brand).
- **Color palette:** Custom hex values defined as CSS custom properties (see
  `design.md` §3.3). These are our own palette, not copied from any product.
- **Pixel art / icons:** Hand-crafted or originally generated buddy icons,
  window chrome, and UI elements. No traced or copied graphics.
- **Sounds:** Synthesized or originally recorded WAV files for IM receive and
  door-open effects. No audio sampled from existing products.
- **Fonts:** System font stacks (Tahoma / Verdana / MS Sans Serif) used via
  CSS font-family fallback chains — no bundled proprietary font files.

### 1.3 README & Documentation

The README and any docs MAY factually note inspiration, subject to these rules:

- Acceptable: "in memoriam of the discontinued AIM-era bots" — a factual,
  non-endorsing statement of inspiration.
- Prohibited: any phrasing that implies affiliation, endorsement, partnership,
  or that SmarterGhost is a revival/continuation of a specific named product.
- Do not use trademarked names as nouns referring to this project (e.g. never
  "an AIM clone" or "like SmarterChild"). Describe the *era* and *style*
  generically ("late-90s instant messaging aesthetic").

### 1.4 Existing Content Audit

> ⚠️ **Action required:** The current `README.md` references "SmarterChild" by
> name ("RIP SmarterChild, 2017") and uses "AIM" as a brand reference. This
> must be revised to comply with this constraint before the project is
> published or demoed. Replace with neutral, non-affiliating language per §1.3.

---

## Constraint 2: Abuse Controls

The public chat endpoint (`POST /api/chat`) is exposed to the open internet
with no authentication. It MUST enforce layered abuse controls to prevent
quota exhaustion, cost overruns, and automated abuse. All limits are tracked
in **Workers KV**.

### 2.1 Required Controls

| Control | Scope | Storage | Behavior on Exceed |
|---------|------|---------|-------------------------|
| Per-IP daily message cap | IP address | KV key `ratelimit:ip:{ip}:{date}` | Reject with canned fallback; do not call Workers AI |
| Per-session rate limit | Session ID | KV key `ratelimit:session:{sessionId}` | Reject with canned fallback; short cooldown window |
| Input length limit | Per request | In-memory (no KV needed) | Reject with error event; do not call Workers AI |
| Global daily circuit breaker | All traffic | KV key `circuit:{date}` | Stop all inference; all chat degrades to canned fallbacks |

### 2.2 Per-IP Daily Message Cap

- Every request to `/api/chat` increments a per-IP counter in KV.
- When the counter exceeds the daily cap, the endpoint MUST short-circuit:
  it returns a canned fallback response and **never invokes Workers AI**.
- The cap is configured as an environment variable (e.g. `IP_DAILY_CAP`,
  default 50 messages/IP/day). This keeps a single abuser from draining the
  shared Workers AI quota.
- The counter resets daily (key is namespaced by date).

### 2.3 Per-Session Rate Limit

- A sliding-window or fixed-window rate limit per session ID limits burst
  traffic (e.g. max 10 messages per minute per session).
- Exceeding the limit returns a canned "slow down" fallback and a short
  cooldown. No AI inference is performed while rate-limited.

### 2.4 Input Length Limit

- Requests with a `text` body exceeding the max input length (e.g. 1000
  characters) are rejected immediately with an in-character error event.
- No KV write or AI call is made for over-length input.

### 2.5 Global Daily Circuit Breaker

- A global counter tracks total AI inference calls across all users per day
  (KV key `circuit:{date}`).
- When the counter approaches the Cloudflare Workers AI free-tier daily
  limit, the circuit breaker trips: **all** `/api/chat` free-text messages
  return canned fallback responses and skip inference entirely. Slash
  commands that do not require AI (weather, wiki, etc.) continue to work.
- The breaker trips *before* the quota is exhausted — set the threshold at
  ~90% of the free-tier daily limit to leave headroom and avoid hard 429s
  from Cloudflare.
- The breaker resets at the next UTC day (key is namespaced by date).

### 2.6 Canned Fallback Responses

When any abuse control triggers, the response MUST be a pre-written,
in-character canned message — not an error code or raw text. Examples:

```
"Whoa, slow down there! I need a breather. Try again in a minute. 😅"
"I've been chatting a lot today and need to rest my circuits. Back tomorrow!"
"That message is a bit long for me — try something shorter?"
```

These fallbacks never invoke the AI, ensuring zero cost when limits trigger.

### 2.7 KV Operation Budget

Abuse-control KV reads/writes count against the free-tier KV quota (1k
writes/day, 100k reads/day). To stay within budget:

- Per-IP and per-session counters use a single KV key per scope+date and
  increment in-place (one write per request — unavoidable but bounded).
- The circuit breaker counter is one global key per day.
- Abuse-control writes are the **highest-priority** KV writes; if KV writes
  are near exhaustion, reminder/away writes are dropped first (per `design.md`
  §7.3) so abuse controls remain functional.

---

## Constraint 3: Cloudflare Free Plan Only

The entire project MUST run on the Cloudflare **free** plan. No feature may
require a paid plan, and no external paid API may be used.

### 3.1 Allowed Resources (Free Tier)

| Resource | Free-tier limit | Project usage must stay within |
|----------|-----------------|-------------------------------|
| Workers requests | 100k/day | Static assets served via `[assets]` binding (no Worker invocation); API calls bounded by abuse controls |
| Workers AI | ~10k neurons/day (varies) | Circuit breaker trips before exhaustion (§2.5) |
| Workers KV | 100k reads/day, 1k writes/day | Minimal writes (abuse controls + reminders + away) |
| Workers CPU time | 10ms (free) / 50ms (paid) | All logic must complete within 10ms CPU; streaming is I/O wait, not CPU |

### 3.2 Prohibited

- **No paid Workers plan features:** Durable Objects, Queues, Cron Triggers
  beyond free allowance, or increased limits. If a design needs any of these,
  it must be reworked to fit the free tier or dropped.
- **No external paid APIs:** Every external integration (weather, wiki,
  dictionary, news) uses a free, no-key API (see `design.md` §6). No API that
  requires a credit card, paid plan, or usage-based billing may be added.
- **No paid third-party services:** No paid auth providers, databases (e.g.
  D1 paid tier, Upstash paid plan), analytics, or monitoring services.

### 3.3 Design Implications

- SSE streaming (not WebSockets) avoids Durable Objects (paid feature).
- Client-side conversation history avoids per-message KV writes.
- Reminders stored as a single JSON array minimize KV writes.
- The circuit breaker (§2.5) is the primary mechanism for staying within the
  Workers AI free-tier limit without incurring cost.

If any future feature cannot be implemented within these limits, it must be
deferred or redesigned — never implemented in a way that requires a paid plan.

---

## Constraint 4: AI Output Safety Filter

All AI-generated output MUST pass through a safety filter before it is
displayed to the user. No AI response — streamed or batch — reaches the chat
transcript without filtering.

### 4.1 Filter Placement

The safety filter sits between Workers AI and the SSE response stream:

```
Workers AI  →  Safety Filter  →  SSE response  →  Browser
```

- For **streamed** responses, each token/chunk is buffered and filtered
  before being emitted as an SSE `token` event. If the filter flags content
  mid-stream, the stream is terminated and replaced with a canned fallback.
- For **batch** responses (if any), the complete text is filtered before
  being returned.

### 4.2 Filter Scope

The filter MUST screen for at minimum:

- Hate speech, slurs, and discriminatory content.
- Sexual or violent content inappropriate for a general-audience chatbot.
- Self-harm or harm-to-others instructions.
- Personally identifiable information (the bot should not output real PII
  that may have been in training data or user-provided context).
- Prompt-injection artifacts — content where the model appears to be
  following injected instructions rather than the system persona.

### 4.3 Filter Behavior

| Outcome | Action |
|---------|--------|
| Clean output | Emit tokens normally via SSE |
| Flagged output | Terminate stream, emit a canned fallback message, do not display the flagged content |
| Filter error | Treat as flagged — fail safe to the fallback rather than showing unfiltered output |

The filter **fails safe**: if the filter itself errors or times out, the AI
output is **not** displayed. A canned fallback is shown instead. It is always
preferable to show a fallback than to show unfiltered AI output.

### 4.4 Implementation Notes

- The filter may use Cloudflare Workers AI's built-in moderation model (e.g.
  `@cf/meta/llama-guard-*`) if available on the free tier, or a rule-based
  keyword/pattern filter as a baseline.
- A rule-based baseline filter (blocklist + pattern matching) is the minimum
  acceptable implementation; ML-based moderation is layered on top if the
  free tier permits it without exceeding quota.
- The filter runs on every AI response regardless of the input — even
  "safe-looking" queries can produce unsafe output from an LLM.

---

## Constraint Compliance Checklist

Before any merge, release, or demo, verify:

- [ ] No trademarked names (AOL, AIM, SmarterChild) appear in user-facing
      content, code identifiers aside from neutral color labels.
- [ ] All visual and audio assets are original (no copied logos, sounds,
      screenshots, or traced artwork).
- [ ] README/docs note inspiration factually without implying affiliation.
- [ ] `/api/chat` enforces per-IP daily cap, per-session rate limit, input
      length limit, and a global daily circuit breaker.
- [ ] All limits degrade to canned fallback responses — never raw errors.
- [ ] No feature requires a Cloudflare paid plan or external paid API.
- [ ] All AI output passes through the safety filter before display.
- [ ] The safety filter fails safe to a fallback on any error.
