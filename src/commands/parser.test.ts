// Unit tests for routeInput (parser.ts) and the registry lookup helpers.
// Design references: §2.1 (parser grammar), §2.2 (registry), §2.3 (parsing flow).
// Authored by the agent (Kiro CLI throttled at time of writing); reviewed
// against design §2 and §8.3.

import { describe, expect, it } from "vitest";

import { routeInput } from "./parser";
import {
  COMMAND_REGISTRY,
  lookupCommand,
  registerCommand,
  allCommands,
  type CommandSpec,
} from "./registry";

describe("routeInput — AI routing (no leading slash)", () => {
  it("routes plain text to the AI handler", () => {
    expect(routeInput("hello there")).toEqual({ kind: "ai" });
  });

  it("routes whitespace-padded plain text to the AI handler", () => {
    expect(routeInput("   how are you?  ")).toEqual({ kind: "ai" });
  });

  it("routes an empty string to the AI handler", () => {
    expect(routeInput("")).toEqual({ kind: "ai" });
  });

  it("routes a whitespace-only string to the AI handler", () => {
    expect(routeInput("   ")).toEqual({ kind: "ai" });
  });

  it("routes a bare '/' (degenerate) to the AI handler", () => {
    expect(routeInput("/")).toEqual({ kind: "ai" });
  });
});

describe("routeInput — command routing", () => {
  it("parses a command with no arguments", () => {
    expect(routeInput("/news")).toEqual({
      kind: "command",
      command: "news",
      args: undefined,
    });
  });

  it("parses a command with arguments", () => {
    expect(routeInput("/weather new york")).toEqual({
      kind: "command",
      command: "weather",
      args: "new york",
    });
  });

  it("lowercases the command name for case-insensitive lookup", () => {
    expect(routeInput("/WEATHER Boston")).toEqual({
      kind: "command",
      command: "weather",
      args: "Boston",
    });
    expect(routeInput("/HeLp").command).toBe("help");
  });

  it("preserves argument case (only the command name is lowercased)", () => {
    const r = routeInput("/define Serendipity");
    expect(r.args).toBe("Serendipity");
  });

  it("trims leading whitespace before the slash", () => {
    const r = routeInput("   /back");
    expect(r).toEqual({ kind: "command", command: "back", args: undefined });
  });

  it("collapses extra whitespace between command and args", () => {
    const r = routeInput("/remind    30m call mom");
    expect(r.command).toBe("remind");
    expect(r.args).toBe("30m call mom");
  });

  it("treats trailing whitespace with no real args as no args", () => {
    const r = routeInput("/news   ");
    expect(r).toEqual({ kind: "command", command: "news", args: undefined });
  });

  it("keeps the full remainder of the line as args", () => {
    const r = routeInput("/remind 1h30m stand up and stretch");
    expect(r.args).toBe("1h30m stand up and stretch");
  });

  it("returns unknown command names as commands (registry resolves, design §2.3)", () => {
    const r = routeInput("/frobnicate stuff");
    expect(r.kind).toBe("command");
    expect(r.command).toBe("frobnicate");
    expect(r.args).toBe("stuff");
  });
});

describe("registry — lookup and alias resolution", () => {
  const weather: CommandSpec = {
    name: "weather",
    aliases: ["w"],
    argSpec: "required",
    description: "Current weather for a location",
    usage: "/weather <location>",
    handler: async () => ({ kind: "text", payload: "" }),
  };

  it("returns undefined for an unknown command (caller falls back to /help)", () => {
    expect(lookupCommand("definitely-not-a-command")).toBeUndefined();
  });

  it("registers and resolves a command by canonical name", () => {
    registerCommand(weather);
    expect(lookupCommand("weather")).toBe(weather);
  });

  it("resolves aliases to the canonical command", () => {
    expect(lookupCommand("w")).toBe(weather);
  });

  it("normalizes case defensively on lookup", () => {
    expect(lookupCommand("WEATHER")).toBe(weather);
  });

  it("lists each canonical command once (aliases not duplicated)", () => {
    const names = allCommands().map((c) => c.name);
    expect(names).toEqual(["weather"]);
    expect(COMMAND_REGISTRY.size).toBe(1);
  });
});
