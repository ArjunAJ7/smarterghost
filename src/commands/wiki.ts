// /wiki — Wikipedia REST summary, no API key (design §6.2).
// Authored by the agent (Kiro CLI throttled); implements design §6.2 exactly.

import type { CommandResult } from "./registry";

const SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";
const SEARCH_URL = "https://en.wikipedia.org/w/rest.php/v1/search/title";
const TIMEOUT_MS = 5_000;
const USER_AGENT = "SmarterGhost/1.0 (+https://smarterghost.arjun-vinod0028.workers.dev)";

const MAX_WORDS = 300;

/** Truncate to at most `max` words, splitting on word boundaries (US-3.2). */
export function truncateWords(text: string, max: number = MAX_WORDS): string {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= max) return text.trim();
  return words.slice(0, max).join(" ") + " ...";
}

async function fetchJsonOrStatus(
  url: string,
): Promise<{ status: number; body?: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": USER_AGENT } });
    if (!res.ok) return { status: res.status };
    return { status: res.status, body: await res.json() };
  } finally {
    clearTimeout(timer);
  }
}

interface Summary {
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

function formatSummary(s: Summary): CommandResult | undefined {
  if (!s.title || !s.extract) return undefined;
  const url =
    s.content_urls?.desktop?.page ??
    `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`;
  return {
    kind: "text",
    payload: `📚 ${s.title}\n${truncateWords(s.extract)}\n[Read more: ${url}]`,
  };
}

export async function wikiHandler(
  args: string | undefined,
): Promise<CommandResult> {
  const topic = args?.trim();
  if (!topic) {
    return { kind: "error", payload: "Usage: /wiki <topic>" };
  }

  const title = topic.replace(/ /g, "_");
  let first: { status: number; body?: unknown };
  try {
    first = await fetchJsonOrStatus(`${SUMMARY_URL}/${encodeURIComponent(title)}`);
  } catch {
    return {
      kind: "error",
      payload: "My encyclopedia just disconnected. Try again in a sec?",
    };
  }

  if (first.status === 200 && first.body) {
    const formatted = formatSummary(first.body as Summary);
    if (formatted) return formatted;
  }

  if (first.status === 404) {
    // Fallback: search redirect (design §6.2).
    try {
      const search = await fetchJsonOrStatus(
        `${SEARCH_URL}?q=${encodeURIComponent(topic)}&limit=1`,
      );
      const hit = (
        search.body as { pages?: { title?: string }[] } | undefined
      )?.pages?.[0]?.title;
      if (search.status === 200 && hit) {
        const second = await fetchJsonOrStatus(
          `${SUMMARY_URL}/${encodeURIComponent(hit.replace(/ /g, "_"))}`,
        );
        if (second.status === 200 && second.body) {
          const formatted = formatSummary(second.body as Summary);
          if (formatted) return formatted;
        }
      }
    } catch {
      // fall through to not-found
    }
    return {
      kind: "text",
      payload: "I couldn't find anything about that. Try a different topic?",
    };
  }

  return {
    kind: "error",
    payload: "My encyclopedia just disconnected. Try again in a sec?",
  };
}
