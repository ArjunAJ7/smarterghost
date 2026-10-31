// src/commands/registry.ts
// Command registry: lookup table for slash commands with alias resolution.
// Design references: §2.2 (CommandSpec/Context/Result), §2.4 (command specs).
//
// The registry is a pure data structure — no switch/case chains. Command
// handlers are populated in Phase 3; this file defines the interfaces and the
// Map that backs the lookup, plus alias resolution helpers.

import type { Env, SessionId } from "../types";

/**
 * Argument specification for a command, used by the parser/validator to
 * produce in-character usage errors when args are missing or unexpected.
 *
 * - `"none"`     — command takes no arguments (e.g. `/news`, `/back`).
 * - `"required"` — command requires at least one argument (e.g. `/weather`).
 * - `"optional"` — arguments are allowed but not required (e.g. `/away`).
 */
export type ArgSpec = "none" | "required" | "optional";

/**
 * Specification for a single slash command.
 */
export interface CommandSpec {
  /** Canonical command name (lowercase, no slash). e.g. "weather". */
  name: string;
  /** Short aliases (lowercase, no slash). e.g. ["w"]. Optional. */
  aliases?: string[];
  /** Argument expectation for validation. */
  argSpec: ArgSpec;
  /** One-line description shown in `/help`. */
  description: string;
  /** Usage string shown on arg-validation failure. e.g. "/weather <location>". */
  usage: string;
  /**
   * Handler invoked when the command is dispatched. Receives the raw args
   * string (or `undefined` if none) and the command context.
   */
  handler: (args: string | undefined, ctx: CommandContext) => Promise<CommandResult>;
}

/**
 * Context passed to every command handler.
 */
export interface CommandContext {
  env: Env;
  sessionId: SessionId;
}

/**
 * Result returned by a command handler.
 *
 * - `"text"`   — a formatted string to display directly in the chat transcript.
 * - `"stream"` — an async generator / ReadableStream to pipe into chat (e.g.
 *                streamed AI output via SSE).
 * - `"error"`  — an in-character error message (not a raw exception).
 */
export interface CommandResult {
  kind: "text" | "stream" | "error";
  payload: string | ReadableStream<Uint8Array>;
}

/**
 * The command registry. Maps every known command name and alias to its spec.
 *
 * Populated in Phase 3 as handlers are implemented. Until then it is empty,
 * but the lookup helpers below remain usable (they return `undefined` for
 * unknown names, which the caller maps to the `/help` fallback).
 */
export const COMMAND_REGISTRY: Map<string, CommandSpec> = new Map();

/**
 * Build a secondary lookup map from alias → canonical command name, so the
 * registry can resolve aliases without iterating. Keys are lowercased.
 */
const ALIAS_INDEX: Map<string, string> = new Map();

/**
 * Register a command spec in the registry. Adds the canonical name and all
 * aliases to the lookup maps. Intended to be called during module init in
 * Phase 3.
 *
 * @param spec — the command specification to register.
 */
export function registerCommand(spec: CommandSpec): void {
  COMMAND_REGISTRY.set(spec.name, spec);
  for (const alias of spec.aliases ?? []) {
    ALIAS_INDEX.set(alias.toLowerCase(), spec.name);
  }
}

/**
 * Look up a command by its name or an alias. Returns the matching spec, or
 * `undefined` if no command is registered under that name/alias.
 *
 * Lookup is case-insensitive — callers should pass a lowercased name, but we
 * normalize defensively in case the parser's lowercasing is bypassed.
 *
 * @param nameOrAlias — the command name or alias (no leading slash, any case).
 */
export function lookupCommand(nameOrAlias: string): CommandSpec | undefined {
  const key = nameOrAlias.toLowerCase();
  const direct = COMMAND_REGISTRY.get(key);
  if (direct !== undefined) {
    return direct;
  }
  // Try alias resolution.
  const canonical = ALIAS_INDEX.get(key);
  if (canonical !== undefined) {
    return COMMAND_REGISTRY.get(canonical);
  }
  return undefined;
}

/**
 * Return all registered command specs (canonical names only — aliases are
 * not duplicated). Used by `/help` to list commands.
 */
export function allCommands(): CommandSpec[] {
  return Array.from(COMMAND_REGISTRY.values());
}
