// src/commands/parser.ts
// Input routing: slash commands vs free-text AI conversation.
// Design references: §2.1–2.3 (parser grammar, parsing flow).

/**
 * Result of routing a raw user input string.
 *
 * - `kind: "command"` — input started with `/`; `command` holds the lowercased
 *   command name (without the slash) and `args` holds the remainder of the
 *   line (or `undefined` if there were no arguments).
 * - `kind: "ai"` — input did not start with `/`; the entire trimmed text is
 *   forwarded to the AI handler.
 *
 * Note: `routeInput` only performs lexical routing. It does NOT validate
 * whether the command exists in the registry — that is the registry's job.
 * An unknown command name is returned with `kind: "command"` so the caller
 * can look it up and fall back to help text (design §2.3).
 */
export interface RouteResult {
  kind: "command" | "ai";
  command?: string;
  args?: string;
}

/**
 * Route a raw user input string to either the command subsystem or the AI
 * handler.
 *
 * Rules (design §2.1–2.3):
 *  1. Trim leading/trailing whitespace.
 *  2. If the trimmed input does not start with `/`, route to the AI handler.
 *  3. If it starts with `/`, tokenize: the first token (after the slash) is
 *     the command name (lowercased for case-insensitive lookup), and the
 *     remainder is the args string.
 *  4. A bare `/` with nothing after it is treated as AI input (degenerate).
 *
 * @param input — raw user input from the chat bar.
 * @returns a {@link RouteResult} indicating the routing decision.
 */
export function routeInput(input: string): RouteResult {
  const trimmed = input.trim();

  // No leading slash → free-text conversation for the AI handler.
  if (!trimmed.startsWith("/")) {
    return { kind: "ai" };
  }

  // Strip the leading slash.
  const withoutSlash = trimmed.slice(1);

  // A bare "/" with nothing after it — treat as AI input (degenerate edge case).
  if (withoutSlash.length === 0) {
    return { kind: "ai" };
  }

  // Tokenize: first whitespace-separated token is the command name; the
  // rest of the line is the args. Use a regex that captures the first run
  // of non-whitespace characters and then the remainder (which may be empty
  // or all-whitespace).
  const match = /^(\S+)(?:\s+(.*))?$/.exec(withoutSlash);

  if (match === null) {
    // Should not happen given the length check above, but guard defensively.
    return { kind: "ai" };
  }

  const command = match[1].toLowerCase();
  // `args` is `undefined` when no arguments were provided, or an empty
  // string if the user typed trailing whitespace with no actual args.
  // We normalize: if the captured args group is empty string, treat it as
  // `undefined` so handlers can distinguish "no args" from "empty args".
  const rawArgs = match[2];
  const args = rawArgs !== undefined && rawArgs.trim().length > 0
    ? rawArgs.trim()
    : undefined;

  return { kind: "command", command, args };
}
