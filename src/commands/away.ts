// /away and /back — away message state (US-4.1, US-4.3, design §2.4).
// Authored by the agent (Kiro CLI throttled).

import { clearAwayState, getAwayState, setAwayState } from "../kv";
import type { CommandContext, CommandResult } from "./registry";

/** `/away [message]` — persist away state in KV and confirm (US-4.1). */
export async function awayHandler(
  args: string | undefined,
  ctx: CommandContext,
): Promise<CommandResult> {
  const message = args?.trim() || "Away from keyboard";
  try {
    await setAwayState(ctx.env.GHOST_KV, ctx.sessionId, {
      message,
      setAt: Date.now(),
    });
  } catch {
    // Design §7.3: KV failure degrades gracefully — the client mirrors the
    // away state locally, so the confirmation still stands.
    return {
      kind: "text",
      payload: `Away message set: "${message}". (Heads up: my memory banks are flaky, so this might not survive a reload.)`,
    };
  }
  return {
    kind: "text",
    payload: `Away message set: "${message}". I'll hold down the fort. Type /back when you return!`,
  };
}

/** `/back` — clear away state and welcome the user back (US-4.3). */
export async function backHandler(
  _args: string | undefined,
  ctx: CommandContext,
): Promise<CommandResult> {
  const existing = await getAwayState(ctx.env.GHOST_KV, ctx.sessionId);
  if (!existing) {
    return {
      kind: "text",
      payload: "You weren't away! But I'm always happy to see you.",
    };
  }
  await clearAwayState(ctx.env.GHOST_KV, ctx.sessionId);
  return {
    kind: "text",
    payload: `Welcome back! Your away message ("${existing.message}") is cleared.`,
  };
}
