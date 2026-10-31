// Registry population (task 3.16, design §2.4).
// Authored by the agent (Kiro CLI throttled).

import { registerCommand } from "./registry";
import { weatherHandler } from "./weather";
import { wikiHandler } from "./wiki";
import { defineHandler } from "./define";
import { newsHandler } from "./news";
import { remindHandler, remindersHandler } from "./remind";
import { awayHandler, backHandler } from "./away";
import { helpHandler } from "./help";

registerCommand({
  name: "weather",
  aliases: ["w"],
  argSpec: "required",
  description: "Current conditions + 1-line forecast",
  usage: "/weather <loc>",
  handler: (args) => weatherHandler(args),
});

registerCommand({
  name: "wiki",
  aliases: ["wk"],
  argSpec: "required",
  description: "300-word-max Wikipedia summary + link",
  usage: "/wiki <topic>",
  handler: (args) => wikiHandler(args),
});

registerCommand({
  name: "define",
  aliases: ["d"],
  argSpec: "required",
  description: "Definitions, POS, pronunciation",
  usage: "/define <word>",
  handler: (args) => defineHandler(args),
});

registerCommand({
  name: "news",
  aliases: ["n"],
  argSpec: "none",
  description: "Top 5 HackerNews front-page headlines",
  usage: "/news",
  handler: () => newsHandler(),
});

registerCommand({
  name: "remind",
  aliases: ["r"],
  argSpec: "required",
  description: "Set a relative-time reminder (/remind cancel <id> to cancel)",
  usage: "/remind <time> <msg>",
  handler: (args, ctx) => remindHandler(args, ctx),
});

registerCommand({
  name: "reminders",
  argSpec: "none",
  description: "List pending reminders",
  usage: "/reminders",
  handler: (args, ctx) => remindersHandler(args, ctx),
});

registerCommand({
  name: "away",
  argSpec: "optional",
  description: "Set away status + message",
  usage: "/away <msg>",
  handler: (args, ctx) => awayHandler(args, ctx),
});

registerCommand({
  name: "back",
  argSpec: "none",
  description: "Clear away status",
  usage: "/back",
  handler: (args, ctx) => backHandler(args, ctx),
});

registerCommand({
  name: "help",
  aliases: ["h", "?"],
  argSpec: "none",
  description: "List all commands",
  usage: "/help",
  handler: () => helpHandler(),
});
