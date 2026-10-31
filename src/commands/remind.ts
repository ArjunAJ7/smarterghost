// src/commands/remind.ts
// Duration parsing for the /remind command.
// Design references: §2.5 (time parsing), §2.6 (argument structure).
//
// parseDuration is a pure function with no I/O, making it ideal for
// property-based testing (design §8.3). The /remind command handler itself
// is implemented in Phase 3 (task 3.11).

/**
 * Result of parsing a duration string.
 *
 * - When `ok` is true, `milliseconds` holds the total duration in ms and
 *   `error` is absent.
 * - When `ok` is false, `error` holds a human-readable explanation and
 *   `milliseconds` is 0.
 */
export interface ParsedDuration {
  milliseconds: number;
  ok: boolean;
  error?: string;
}

/** Minimum accepted duration: 1 second. */
export const MIN_DURATION_MS = 1_000;

/** Maximum accepted duration: 30 days. */
export const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

/** Multipliers per supported unit (lowercase). */
const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
};

/**
 * Parse a relative-duration string such as "30m", "1h30m", or "2d4h" into a
 * total number of milliseconds.
 *
 * Algorithm (design §2.5):
 *  1. Trim and lowercase the input.
 *  2. Match all `(\\d+)\\s*(s|m|h|d)` tokens via a global regex. Each token is
 *     a number followed by optional whitespace and a unit letter.
 *  3. If no tokens match, return an error.
 *  4. Sum the millisecond contributions for every matched token.
 *  5. Validate that the entire input was consumed by tokens (no leftover
 *     garbage between/after them). Leftover characters → error.
 *  6. Validate the total is within [1s, 30d].
 *  7. Return the sum.
 *
 * The minimum is 1 second (so `0s` is rejected) and the maximum is 30 days
 * (so `31d` is rejected). Both bounds are inclusive.
 *
 * @param input — the duration string (e.g. "1h30m").
 * @returns a {@link ParsedDuration}.
 */
export function parseDuration(input: string): ParsedDuration {
  const trimmed = input.trim().toLowerCase();

  if (trimmed.length === 0) {
    return { milliseconds: 0, ok: false, error: "empty duration" };
  }

  // Match all number+unit tokens. Allow optional whitespace between the
  // number and the unit, but NOT between consecutive tokens (so "1h 30m" with
  // a space is accepted; "1h30m" without is also accepted). Whitespace between
  // tokens is allowed for readability.
  const tokenRegex = /(\d+)\s*(s|m|h|d)/g;
  let total = 0;
  let lastEnd = 0;
  let sawToken = false;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(trimmed)) !== null) {
    // Ensure no garbage between the end of the previous token and this one.
    // Whitespace between tokens is fine; anything else is not.
    const gap = trimmed.slice(lastEnd, match.index);
    if (gap.length > 0 && /\S/.test(gap)) {
      return {
        milliseconds: 0,
        ok: false,
        error: `unexpected characters: "${gap.trim()}"`,
      };
    }

    const value = Number(match[1]);
    const unit = match[2];

    total += value * UNIT_MS[unit];
    lastEnd = tokenRegex.lastIndex;
    sawToken = true;
  }

  if (!sawToken) {
    return {
      milliseconds: 0,
      ok: false,
      error: "no valid duration tokens found",
    };
  }

  // Ensure no trailing garbage after the last token.
  const trailing = trimmed.slice(lastEnd);
  if (trailing.length > 0 && /\S/.test(trailing)) {
    return {
      milliseconds: 0,
      ok: false,
      error: `unexpected characters: "${trailing.trim()}"`,
    };
  }

  // Range validation. Note: we intentionally check the summed total rather
  // than individual tokens, so "0s" (which sums to 0) is rejected while
  // "0s5m" would be accepted as 5 minutes. However "0s" alone is the more
  // common case to reject.
  if (total < MIN_DURATION_MS) {
    return {
      milliseconds: 0,
      ok: false,
      error: "duration must be at least 1 second",
    };
  }

  if (total > MAX_DURATION_MS) {
    return {
      milliseconds: 0,
      ok: false,
      error: "duration must not exceed 30 days",
    };
  }

  return { milliseconds: total, ok: true };
}

// ---------------------------------------------------------------------------
// /remind command handler (design §2.6) — added in Phase 3C.
// Handler portion authored by the agent (Kiro CLI throttled).
// ---------------------------------------------------------------------------

import {
  addReminder,
  cancelReminder,
  getReminders,
} from "../kv";
import type { CommandContext, CommandResult } from "./registry";
import type { Reminder } from "../types";

/** Generate a short 6-char base36 reminder ID (design §4.2). */
export function generateReminderId(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) id += alphabet[b % 36];
  return id;
}

/** Humanize a millisecond duration: "2 days 4 hours", "30 minutes", ... */
export function humanizeDuration(ms: number): string {
  const units: [string, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1_000],
  ];
  const parts: string[] = [];
  let rest = ms;
  for (const [name, size] of units) {
    const n = Math.floor(rest / size);
    if (n > 0) {
      parts.push(`${n} ${name}${n === 1 ? "" : "s"}`);
      rest -= n * size;
    }
    if (parts.length === 2) break;
  }
  return parts.length > 0 ? parts.join(" ") : "0 seconds";
}

function formatReminderList(reminders: Reminder[]): string {
  if (reminders.length === 0) {
    return "No reminders set. Use /remind <duration> <message> to set one!";
  }
  const sorted = [...reminders].sort((a, b) => a.dueAt - b.dueAt);
  const now = Date.now();
  const lines = ["Your reminders:"];
  for (const r of sorted) {
    const inMs = r.dueAt - now;
    const when = inMs <= 0 ? "due now" : `in ${humanizeDuration(inMs)}`;
    lines.push(`- [${r.id}] ${r.message} (${when})`);
  }
  return lines.join("\n");
}

/**
 * `/remind` handler (design §2.6):
 *   /remind <duration> <message...>  → create
 *   /remind cancel <id>              → cancel
 *   /remind list                     → list (alias for /reminders)
 */
export async function remindHandler(
  args: string | undefined,
  ctx: CommandContext,
): Promise<CommandResult> {
  const kv = ctx.env.GHOST_KV;
  const trimmed = args?.trim() ?? "";

  if (trimmed.length === 0) {
    return {
      kind: "error",
      payload: "Usage: /remind <duration> <message> — e.g. /remind 30m call mom",
    };
  }

  const firstToken = trimmed.split(/\s+/)[0].toLowerCase();

  if (firstToken === "cancel") {
    const id = trimmed.split(/\s+/)[1];
    if (!id) {
      return { kind: "error", payload: "Usage: /remind cancel <id>" };
    }
    const removed = await cancelReminder(kv, ctx.sessionId, id);
    return {
      kind: "text",
      payload: removed
        ? `Reminder ${id} cancelled.`
        : `I couldn't find a reminder with id ${id}.`,
    };
  }

  if (firstToken === "list") {
    return {
      kind: "text",
      payload: formatReminderList(await getReminders(kv, ctx.sessionId)),
    };
  }

  // Split leading duration tokens from the message: longest valid prefix.
  const tokens = trimmed.split(/\s+/);
  let durationMs = 0;
  let consumed = 0;
  for (let k = 1; k <= tokens.length; k++) {
    const candidate = tokens.slice(0, k).join(" ");
    const parsed = parseDuration(candidate);
    if (parsed.ok) {
      durationMs = parsed.milliseconds;
      consumed = k;
    } else if (k > 1) {
      break;
    }
  }

  if (consumed === 0) {
    return {
      kind: "error",
      payload:
        "I didn't understand that time. Try something like 30m, 1h30m, or 2d.",
    };
  }

  const message = tokens.slice(consumed).join(" ").trim();
  if (message.length === 0) {
    return {
      kind: "error",
      payload: "Remind you to do what? Add a message after the time.",
    };
  }

  const now = Date.now();
  const reminder: Reminder = {
    id: generateReminderId(),
    message,
    dueAt: now + durationMs,
    createdAt: now,
  };
  await addReminder(kv, ctx.sessionId, reminder);

  return {
    kind: "text",
    payload: `Got it! I'll remind you in ${humanizeDuration(durationMs)}: "${message}" (id: ${reminder.id})`,
  };
}

/** `/reminders` handler — alias for `/remind list` (US-5.4). */
export async function remindersHandler(
  _args: string | undefined,
  ctx: CommandContext,
): Promise<CommandResult> {
  return {
    kind: "text",
    payload: formatReminderList(await getReminders(ctx.env.GHOST_KV, ctx.sessionId)),
  };
}
