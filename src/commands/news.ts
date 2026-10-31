// /news — HackerNews front page via Algolia API, no key (design §6.4).
// Authored by the agent (Kiro CLI throttled); implements design §6.4 exactly.

import type { CommandResult } from "./registry";

const HN_URL = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5";
const TIMEOUT_MS = 5_000;
const USER_AGENT = "SmarterGhost/1.0 (https://smarterghost.arjun-vinod0028.workers.dev)";

interface HNHit {
  title?: string;
  url?: string;
  points?: number;
  objectID?: string;
}

export async function newsHandler(): Promise<CommandResult> {
  let data: { hits?: HNHit[] };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(HN_URL, {
        signal: ctrl.signal,
        headers: { "user-agent": USER_AGENT },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as { hits?: HNHit[] };
  } catch {
    return {
      kind: "error",
      payload: "Can't reach the news feeds right now. Try again in a bit?",
    };
  }

  const hits = (data.hits ?? []).filter((h) => h.title).slice(0, 5);
  if (hits.length === 0) {
    return {
      kind: "text",
      payload: "No headlines right now — the feeds are quiet. Check back soon?",
    };
  }

  const lines = ["📰 Top Headlines:"];
  hits.forEach((h, i) => {
    const link = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
    lines.push(`${i + 1}. ${h.title} (${h.points ?? 0} points)`);
    lines.push(`   ${link}`);
  });
  return { kind: "text", payload: lines.join("\n") };
}
