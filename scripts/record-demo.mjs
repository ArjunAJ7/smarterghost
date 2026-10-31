// Record the SmarterGhost demo against the deployed app.
// puppeteer-core + system Chrome; CDP screencast -> webm frames.
// Usage: node scripts/record-demo.mjs [baseUrl] [outDir]
// Authored by the agent; see docs/demo-script.md for the shot list.

import puppeteer from "puppeteer-core";
import fs from "node:fs";

const BASE = process.argv[2] ?? "https://smarterghost.arjun-vinod0028.workers.dev";
const OUT = process.argv[3] ?? "recordings";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,800"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

// Fresh session: no localStorage history.
await page.goto(BASE, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle0" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => page.screenshot({ path: `${OUT}/${name}.png` });

async function send(text) {
  await page.click(".chat-input-bar input");
  await page.type(".chat-input-bar input", text, { delay: 35 });
  await page.keyboard.press("Enter");
}

async function waitBotIdle(timeout = 25000) {
  // Wait until the typing indicator is hidden again.
  await page.waitForFunction(
    () => document.querySelector(".typing-indicator")?.hidden !== false,
    { timeout },
  ).catch(() => {});
  await sleep(400);
}

// Shot 2-3: greeting + free-text chat with streaming
await sleep(1500);
await shot("01-greeting");
await send("hey ghost, what have you been up to since 2017?");
await sleep(2500); // catch streaming mid-flight
await shot("02-streaming");
await waitBotIdle();
await shot("03-chat-done");

// Shot 4: commands montage
await send("/weather kochi");
await waitBotIdle();
await shot("04-weather");
await send("/wiki instant messaging");
await waitBotIdle();
await shot("05-wiki");
await send("/news");
await waitBotIdle();
await shot("06-news");

// Shot 5: away + reminder
await send("/away grabbing lunch");
await waitBotIdle();
await shot("07-away");
await send("/remind 15s check the oven");
await waitBotIdle();
await sleep(16000); // wait for the reminder to fire via SSE
await shot("08-reminder");

await browser.close();
console.log("screenshots written to", OUT);
