# SmarterGhost — Requirements

## Introduction

SmarterGhost is a Kiroween 2026 hackathon entry in the **Resurrection** category. The project resurrects the spirit of SmarterChild — the iconic AIM-era chatbot discontinued in 2017 — as a genuinely useful modern AI assistant wrapped in a faithful late-1990s / early-2000s AOL Instant Messenger (AIM) style interface.

The application is a single-page web app backed by a Cloudflare Worker. The Worker hosts the static frontend, proxies chat requests to Cloudflare Workers AI (a free-tier Llama model), and persists lightweight state (reminders, away messages, profile) in Workers KV. The frontend recreates the classic AIM experience: a buddy list window, chat windows with the iconic blue-and-yellow styling, customizable away messages, and user profiles — all while delivering real utility through modern AI.

### Bot Capabilities

The SmarterGhost bot provides the following utility, all surfaced through natural chat or slash commands:

- **Casual conversation** with a playful retro-bot personality ( nods to classic SmarterChild banter).
- **Weather** — current conditions for a given city or zip code.
- **Wikipedia facts** — concise summaries of any topic.
- **Dictionary** — word definitions, parts of speech, and pronunciation hints.
- **RSS headlines** — top headlines from configurable news feeds.
- **Reminders** — set reminders that persist in Workers KV and surface notifications when due.

### Technical Context

| Concern | Choice |
|---|---|
| Backend runtime | Cloudflare Workers |
| AI inference | Cloudflare Workers AI (free-tier Llama model) |
| Persistence | Cloudflare Workers KV |
| Frontend | Static HTML/CSS/JS served by the Worker |
| Target latency | First token < 5 s on free tier |

---

## User Stories

### US-1: Retro AIM Interface

**As a** visitor to the app,
**I want** to see a faithful late-90s AIM-style interface with a buddy list and chat window,
**so that** I feel transported back to the AIM era while using a modern AI bot.

**Acceptance Criteria:**

1. **WHEN** the page loads, **THEN** the system **SHALL** display a buddy list window styled after classic AIM (blue title bar with minimize/close buttons, yellow/white contact rows, online/offline grouping) **AND** a chat window with the iconic AIM chat styling (blue header, yellow typing input bar, monospace timestamp).

2. **WHEN** a buddy list entry representing SmarterGhost is double-clicked, **THEN** the system **SHALL** open a chat window titled with the bot's screen name.

3. **WHEN** the user types into the chat input bar and presses Enter, **THEN** the system **SHALL** append the message to the chat transcript with the user's chosen screen name, a timestamp, and AIM-style message formatting (blue text for the local user).

4. **WHEN** the chat window or buddy list is interacted with, **THEN** the interface **SHALL** reproduce period-accurate visual details including the AIM color palette (blues, yellows, grays), Win95-style window chrome, and system sounds opt-in toggle.

### US-2: AI Chat via Workers AI

**As a** user chatting with SmarterGhost,
**I want** the bot to respond with natural, helpful, and personality-driven replies powered by a real LLM,
**so that** it feels like SmarterChild came back smarter than ever.

**Acceptance Criteria:**

1. **WHEN** the user sends a free-text message that is not a recognized slash command, **THEN** the Worker **SHALL** forward the conversation context to Cloudflare Workers AI and stream the LLM response back into the chat transcript.

2. **WHEN** the bot replies, **THEN** the response **SHALL** reflect a playful retro-bot persona (short, chatty, occasionally self-aware about being a resurrected AIM bot) while remaining genuinely helpful.

3. **WHEN** the Workers AI endpoint returns an error or times out, **THEN** the system **SHALL** display a friendly in-character fallback message in the chat window and allow the user to retry.

4. **WHEN** a response is being generated, **THEN** the UI **SHALL** show a typing indicator styled after AIM's "typing…" status **AND** populate the reply incrementally as tokens stream in.

### US-3: Bot Utility Commands

**As a** user,
**I want** to invoke utility features via slash commands (e.g. `/weather`, `/wiki`, `/define`, `/news`),
**so that** I can get quick factual answers without leaving the chat.

**Acceptance Criteria:**

1. **WHEN** the user sends `/weather <location>`, **THEN** the bot **SHALL** fetch current weather for that location and reply with temperature, conditions, and a one-line forecast summary.

2. **WHEN** the user sends `/wiki <topic>`, **THEN** the bot **SHALL** fetch the Wikipedia article summary and reply with a concise (≤ 300 word) overview **AND** a link to the full article.

3. **WHEN** the user sends `/define <word>`, **THEN** the bot **SHALL** reply with the word's definition(s), part(s) of speech, and a phonetic pronunciation hint.

4. **WHEN** the user sends `/news`, **THEN** the bot **SHALL** fetch headlines from a configured RSS feed and reply with the top 5 headlines, each with a link.

5. **WHEN** the user sends an unrecognized slash command, **THEN** the bot **SHALL** reply with a help message listing all available commands and a brief description of each.

### US-4: Away Messages

**As a** user,
**I want** to set an away message that the bot acknowledges and displays to anyone messaging me,
**so that** I can recreate the classic AIM away-message experience.

**Acceptance Criteria:**

1. **WHEN** the user sends `/away <message>`, **THEN** the system **SHALL** mark the user as away in the buddy list (grayed-out icon with away note) **AND** persist the away message in Workers KV.

2. **WHEN** the user is away and sends any message, **THEN** the system **SHALL** automatically clear the away status **AND** remove the stored away message.

3. **WHEN** the user sends `/back`, **THEN** the system **SHALL** clear the away status and confirm with an in-character "welcome back" message.

4. **WHEN** the user is away and views the buddy list, **THEN** the user's own entry **SHALL** display the away-note icon and truncated away text, matching AIM's visual treatment.

### US-5: Reminders with KV Persistence

**As a** user,
**I want** to set reminders that persist across sessions and notify me when due,
**so that** the bot is genuinely useful beyond novelty chat.

**Acceptance Criteria:**

1. **WHEN** the user sends `/remind <time> <message>` (e.g. `/remind 30m Check oven`), **THEN** the system **SHALL** parse the relative time, store the reminder in Workers KV with a due timestamp, and confirm with a human-readable due time.

2. **WHEN** a stored reminder becomes due and the user has an active chat session, **THEN** the system **SHALL** post a reminder notification into the chat window with the original message **AND** an AIM-style alert sound (if enabled).

3. **WHEN** the user sends `/reminders`, **THEN** the bot **SHALL** list all pending reminders sorted by due time, each with the message and time remaining.

4. **WHEN** the user sends `/remind cancel <id>`, **THEN** the system **SHALL** remove the specified reminder from KV and confirm cancellation.

5. **WHEN** the Worker restarts or a new session begins, **THEN** all persisted reminders **SHALL** remain available and active, demonstrating KV-backed durability.

### US-6: Mobile Responsiveness

**As a** user on a phone,
**I want** the AIM interface to adapt to a small screen,
**so that** I can chat with SmarterGhost on the go without a broken layout.

**Acceptance Criteria:**

1. **WHEN** the viewport width is ≤ 768 px, **THEN** the buddy list and chat window **SHALL** stack vertically (buddy list collapsible) rather than side-by-side.

2. **WHEN** the chat input is focused on a touch device, **THEN** the interface **SHALL** prevent the page from scrolling erratically **AND** keep the input bar visible above the on-screen keyboard.

3. **WHEN** the screen is small, **THEN** message text **SHALL** remain readable at a minimum effective font size of 14 px with no horizontal scrolling of the transcript.

### US-7: Performance on Cloudflare Free Tier

**As a** operator running on the Cloudflare Workers free tier,
**I want** the app to stay within free-tier limits and respond quickly,
**so that** the hackathon demo is smooth and costs nothing.

**Acceptance Criteria:**

1. **WHEN** a chat request is processed, **THEN** the Worker **SHALL** return the first token of an AI response within 5 seconds under normal free-tier conditions.

2. **WHEN** Workers AI rate limits are approached, **THEN** the system **SHALL** gracefully degrade by informing the user in-character rather than crashing.

3. **WHEN** the static frontend assets are requested, **THEN** the Worker **SHALL** serve them with appropriate cache headers so that repeat loads are fast and minimize Worker invocations.

4. **WHEN** KV read/write operations occur, **THEN** the system **SHALL** batch and minimize them so that free-tier daily KV operation limits are not exhausted by a single user session.
