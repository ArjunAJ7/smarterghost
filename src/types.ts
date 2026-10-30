// src/types.ts
// Shared type definitions for SmarterGhost Worker + bindings + data models.
// Design references: §1.4 (Env), §4.2 (data structures).

/**
 * Cloudflare Worker environment bindings.
 *
 * - ASSETS: static asset binding for serving files from ./public.
 * - AI: Workers AI binding (free tier).
 * - GHOST_KV: Workers KV namespace for session-scoped state.
 */
export interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  GHOST_KV: KVNamespace;
}

/**
 * Session identifier — a browser-generated UUID stored in localStorage and
 * passed as the `X-Session-Id` header on all /api/* requests. No auth.
 */
export type SessionId = string;

/**
 * Away-state persisted in KV under `session:{id}:away`.
 * TTL: 7 days.
 */
export interface AwayState {
  message: string;
  setAt: number; // epoch ms
}

/**
 * A pending reminder. Stored as part of the `session:{id}:reminders` JSON
 * array. `id` is a short 6-char base36 identifier used by `/remind cancel`.
 */
export interface Reminder {
  id: string; // 6-char base36 short id
  message: string;
  dueAt: number; // epoch ms
  createdAt: number; // epoch ms
}

/**
 * The user's chosen screen name, persisted in KV under
 * `session:{id}:screenname`. TTL: 30 days.
 */
export interface ScreenName {
  name: string;
  createdAt: number; // epoch ms
}
