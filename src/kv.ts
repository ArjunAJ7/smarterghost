// src/kv.ts
// KV helpers for session-scoped state: reminders, away state, screen name.
// Design references: §4.1 (KV key scheme), §4.2 (data structures),
//                   §4.3 (read/write strategy), §4.4 (reminder lifecycle).
//
// All keys are namespaced by session ID so each user's data is isolated
// without authentication. TTLs match the design spec:
//   - away state:      7 days
//   - screen name:     30 days
//   - reminders list:  no TTL (manual cancel)
//   - due-check key:   dueAt + 1 hour (auto-expire stale reminders)

import type { AwayState, Reminder, ScreenName, SessionId } from "./types";

// ---------------------------------------------------------------------------
// Key scheme constants (design §4.1)
// ---------------------------------------------------------------------------

/** Session-scoped key prefix for away state. */
const AWAY_KEY = (sid: SessionId) => `session:${sid}:away`;

/** Session-scoped key prefix for screen name. */
const SCREENNAME_KEY = (sid: SessionId) => `session:${sid}:screenname`;

/** Session-scoped key for the reminders JSON array. */
const REMINDERS_KEY = (sid: SessionId) => `session:${sid}:reminders`;

/** Session-scoped key for an individual due-check reminder. */
const REMINDER_DUE_KEY = (sid: SessionId, dueTs: number) =>
  `session:${sid}:reminders:due:${dueTs}`;

// ---------------------------------------------------------------------------
// TTL constants (design §4.1) — in seconds, for KV `expirationTtl`
// ---------------------------------------------------------------------------

/** 7 days in seconds. */
const AWAY_TTL_SEC = 7 * 24 * 60 * 60;

/** 30 days in seconds. */
const SCREENNAME_TTL_SEC = 30 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/**
 * Read the full reminders array for a session.
 *
 * Design §4.3.1: reminders are stored as a single JSON array under
 * `session:{id}:reminders` to minimize KV writes. Returns an empty array
 * when the key does not exist.
 */
export async function getReminders(
  kv: KVNamespace,
  sessionId: SessionId,
): Promise<Reminder[]> {
  const raw = await kv.get<Reminder[]>(REMINDERS_KEY(sessionId), "json");
  return raw ?? [];
}

/**
 * Overwrite the entire reminders array for a session.
 *
 * Design §4.3.1: creating/canceling a reminder rewrites the whole array.
 * Acceptable because reminders are low-frequency (a few per session).
 */
export async function saveReminders(
  kv: KVNamespace,
  sessionId: SessionId,
  reminders: Reminder[],
): Promise<void> {
  await kv.put(REMINDERS_KEY(sessionId), JSON.stringify(reminders));
}

/**
 * Add a new reminder and write the due-check key with TTL.
 *
 * Design §4.4: The reminder is appended to the JSON array, then a separate
 * due-check key is written with `expirationTtl = (dueAt + 1h - now) / 1000`
 * so stale reminders auto-expire without cleanup writes (design §4.3.2).
 */
export async function addReminder(
  kv: KVNamespace,
  sessionId: SessionId,
  reminder: Reminder,
): Promise<void> {
  const existing = await getReminders(kv, sessionId);
  const updated = [...existing, reminder];
  await saveReminders(kv, sessionId, updated);

  // Due-check key: expires one hour after the due time (design §4.1).
  const ttlSec = Math.max(
    1,
    Math.floor((reminder.dueAt + 60 * 60 * 1_000 - Date.now()) / 1_000),
  );
  await kv.put(REMINDER_DUE_KEY(sessionId, reminder.dueAt), JSON.stringify(reminder), {
    expirationTtl: ttlSec,
  });
}

/**
 * Cancel (remove) a reminder by its short ID.
 *
 * Returns `true` if the reminder was found and removed, `false` otherwise.
 * The due-check key is also deleted to avoid orphaned entries.
 */
export async function cancelReminder(
  kv: KVNamespace,
  sessionId: SessionId,
  reminderId: string,
): Promise<boolean> {
  const reminders = await getReminders(kv, sessionId);
  const found = reminders.find((r) => r.id === reminderId);
  if (!found) {
    return false;
  }

  const remaining = reminders.filter((r) => r.id !== reminderId);
  await saveReminders(kv, sessionId, remaining);
  await kv.delete(REMINDER_DUE_KEY(sessionId, found.dueAt));
  return true;
}

// ---------------------------------------------------------------------------
// Away state
// ---------------------------------------------------------------------------

/**
 * Read the away state for a session.
 *
 * Design §4.1: key `session:{id}:away`, TTL 7 days. Returns `null` when the
 * user is not away (or the key has expired).
 */
export async function getAwayState(
  kv: KVNamespace,
  sessionId: SessionId,
): Promise<AwayState | null> {
  return kv.get<AwayState>(AWAY_KEY(sessionId), "json");
}

/**
 * Set the away state for a session. TTL is 7 days (design §4.1).
 */
export async function setAwayState(
  kv: KVNamespace,
  sessionId: SessionId,
  away: AwayState,
): Promise<void> {
  await kv.put(AWAY_KEY(sessionId), JSON.stringify(away), {
    expirationTtl: AWAY_TTL_SEC,
  });
}

/**
 * Clear the away state (user is back). Deletes the KV key.
 */
export async function clearAwayState(
  kv: KVNamespace,
  sessionId: SessionId,
): Promise<void> {
  await kv.delete(AWAY_KEY(sessionId));
}

// ---------------------------------------------------------------------------
// Screen name
// ---------------------------------------------------------------------------

/**
 * Read the user's saved screen name for a session.
 *
 * Design §4.1: key `session:{id}:screenname`, TTL 30 days. Returns `null` when
 * no screen name has been set (or it has expired).
 */
export async function getScreenName(
  kv: KVNamespace,
  sessionId: SessionId,
): Promise<ScreenName | null> {
  return kv.get<ScreenName>(SCREENNAME_KEY(sessionId), "json");
}

/**
 * Persist the user's screen name. TTL is 30 days (design §4.1).
 */
export async function setScreenName(
  kv: KVNamespace,
  sessionId: SessionId,
  screenName: ScreenName,
): Promise<void> {
  await kv.put(SCREENNAME_KEY(sessionId), JSON.stringify(screenName), {
    expirationTtl: SCREENNAME_TTL_SEC,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Exposed for tests to verify key construction. */
export const _keys = {
  away: AWAY_KEY,
  screenname: SCREENNAME_KEY,
  reminders: REMINDERS_KEY,
  reminderDue: REMINDER_DUE_KEY,
};

/** Exposed for tests to verify TTL values. */
export const _ttl = {
  away: AWAY_TTL_SEC,
  screenname: SCREENNAME_TTL_SEC,
};
