// /help — list registered commands (US-3.5); fallback for unknown commands.
// Authored by the agent (Kiro CLI throttled).

import { allCommands } from "./registry";
import type { CommandResult } from "./registry";

/** Build the help text from the registry (design §2.2). */
export function helpText(): string {
  const lines = [
    "SmarterGhost commands:",
    ...allCommands().map((c) => `  ${c.usage} — ${c.description}`),
    "",
    "Or just type a message to chat!",
  ];
  return lines.join("\n");
}

/** `/help` handler. */
export async function helpHandler(): Promise<CommandResult> {
  return { kind: "text", payload: helpText() };
}

/** Fallback for unknown commands (design §2.3, US-3.5). */
export function unknownCommandResult(name: string): CommandResult {
  return {
    kind: "text",
    payload: `I don't know "/${name}" — but here's what I can do:\n\n${helpText()}`,
  };
}
