// Unit tests for /help and registry population (US-3.5, design §2.4).
// Authored by the agent (Kiro CLI throttled).

import { describe, expect, it } from "vitest";

import "./index"; // populates the registry
import { helpHandler, helpText, unknownCommandResult } from "./help";
import { lookupCommand, allCommands } from "./registry";

describe("registry population (design §2.4)", () => {
  it("registers all nine commands", () => {
    const names = allCommands().map((c) => c.name).sort();
    expect(names).toEqual([
      "away",
      "back",
      "define",
      "help",
      "news",
      "remind",
      "reminders",
      "weather",
      "wiki",
    ]);
  });

  it("resolves every documented alias", () => {
    expect(lookupCommand("w")?.name).toBe("weather");
    expect(lookupCommand("wk")?.name).toBe("wiki");
    expect(lookupCommand("d")?.name).toBe("define");
    expect(lookupCommand("n")?.name).toBe("news");
    expect(lookupCommand("r")?.name).toBe("remind");
    expect(lookupCommand("h")?.name).toBe("help");
    expect(lookupCommand("?")?.name).toBe("help");
  });
});

describe("helpHandler (US-3.5)", () => {
  it("lists every registered command with its usage", async () => {
    const r = await helpHandler();
    expect(r.kind).toBe("text");
    for (const c of allCommands()) {
      expect(String(r.payload)).toContain(c.usage);
    }
  });

  it("unknown-command fallback includes the attempted name and help text", () => {
    const r = unknownCommandResult("frobnicate");
    expect(String(r.payload)).toContain('"/frobnicate"');
    expect(String(r.payload)).toContain(helpText());
  });
});
