# Devpost submission draft (Kiroween 2026 — Resurrection)

## Project title
SmarterGhost

## Elevator pitch
SmarterChild is back from the dead — the AIM-era bot rebuilt as a modern AI
assistant inside a faithful 1999 AIM interface, running entirely on
Cloudflare's free tier.

## Inspiration
In 1999, every AIM buddy list had SmarterChild: a pattern-matching bot that
could tell you the weather and define words. It died with AIM in 2017. For
Kiroween's Resurrection category, we brought it back — same buddy list, same
away messages, same IM window — but this time the ghost in the machine is a
real LLM.

## What it does
- Free-text chat with a retro-persona LLM (Llama 3.1 8B, streamed token by
  token like a real IM conversation)
- Slash commands SmarterChild wishes it had: /weather, /wiki, /define, /news
- /remind with natural relative times ("1h30m"), delivered in-chat
- /away and /back with buddy-list status sync, exactly like 1999
- Retro details: Win95 window chrome, buddy icons, AIM sounds (opt-in),
  mobile-responsive buddy list

## How we built it
Spec-driven development with Kiro: requirements.md and design.md first, then
23 property-based + unit test-backed implementation tasks. Cloudflare Workers
serves the SPA and API; Workers AI streams Llama responses over SSE; Workers
KV stores session-scoped reminders and away state with TTLs. 133 tests,
including property tests (fast-check) and integration tests against a real
dev server. Zero cost: entirely on Cloudflare's free tier.

## Challenges
- Keeping free-tier limits honest: KV write minimization (single-array
  reminders, TTL expiry), AI rate-limit degradation with in-character
  fallbacks and a manual Try again (never silent auto-retry)
- SSE streaming end to end: Workers AI stream -> SSE transform -> browser
  incremental rendering
- Period-accurate UI that still works on a phone keyboard

## What's next
Multiple bots on one buddy list; door-open sounds when buddies come online;
custom away-message presets.

## Links
- Repo: https://github.com/ArjunAJ7/smarterghost (MIT)
- Live: https://smarterghost.arjun-vinod0028.workers.dev
- Video: (YouTube link TBD after recording)
