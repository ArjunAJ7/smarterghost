// Property-based tests for the command parser (design §8.3, Properties 5-8).
// Authored by the agent (Kiro CLI throttled at time of writing); properties
// transcribed from design §8.3 with the registry composition made explicit.

import { describe, it } from "vitest";
import * as fc from "fast-check";

import { routeInput } from "./parser";
import { lookupCommand } from "./registry";

// Commands from the design grammar (§2.1).
const KNOWN_COMMANDS = new Set([
  "weather",
  "wiki",
  "define",
  "news",
  "remind",
  "reminders",
  "away",
  "back",
  "help",
]);

describe("parser properties (design §8.3)", () => {
  it("Property 5: any input starting with '/' is never routed to the AI handler", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\/\S.*/), (input) => {
        return routeInput(input).kind === "command";
      }),
    );
  });

  it("Property 6: any input not starting with '/' routes to the AI handler", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[^/].*/), (input) => {
        return routeInput(input).kind === "ai";
      }),
    );
  });

  it("Property 7: an unrecognized command falls through to the help path (registry returns undefined)", () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^\/[a-z]+/)
          .filter((s) => !KNOWN_COMMANDS.has(s.slice(1).split(/\s/)[0])),
        (input) => {
          const route = routeInput(input);
          if (route.kind !== "command" || route.command === undefined) {
            return false;
          }
          // Registry has no entry → caller shows /help (design §2.3, US-3.5).
          return lookupCommand(route.command) === undefined;
        },
      ),
    );
  });

  it("Property 8: command names are lowercased before lookup", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\/[A-Za-z]+/), (input) => {
        const result = routeInput(input);
        if (result.kind !== "command" || result.command === undefined) {
          return true;
        }
        return result.command === result.command.toLowerCase();
      }),
    );
  });
});
