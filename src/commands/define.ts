// /define — Free Dictionary API, no key (design §6.3).
// Authored by the agent (Kiro CLI throttled); implements design §6.3 exactly.

import type { CommandResult } from "./registry";

const DICT_URL = "https://api.dictionaryapi.dev/api/v2/entries/en";
const TIMEOUT_MS = 5_000;
const USER_AGENT = "SmarterGhost/1.0 (https://smarterghost.arjun-vinod0028.workers.dev)";

interface DictEntry {
  word?: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition?: string; example?: string }[];
  }[];
}

export async function defineHandler(
  args: string | undefined,
): Promise<CommandResult> {
  const word = args?.trim().split(/\s+/)[0];
  if (!word) {
    return { kind: "error", payload: "Usage: /define <word>" };
  }

  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      res = await fetch(`${DICT_URL}/${encodeURIComponent(word.toLowerCase())}`, {
        signal: ctrl.signal,
        headers: { "user-agent": USER_AGENT },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return {
      kind: "error",
      payload: "My dictionary fell behind the couch. Try again in a sec?",
    };
  }

  if (res.status === 404) {
    return {
      kind: "text",
      payload: "I don't have a definition for that. Maybe it's not a real word?",
    };
  }
  if (!res.ok) {
    return {
      kind: "error",
      payload: "My dictionary fell behind the couch. Try again in a sec?",
    };
  }

  const entries = (await res.json()) as DictEntry[];
  const entry = entries?.[0];
  if (!entry?.word || !entry.meanings?.length) {
    return {
      kind: "text",
      payload: "I don't have a definition for that. Maybe it's not a real word?",
    };
  }

  const phonetic =
    entry.phonetic ?? entry.phonetics?.find((p) => p.text)?.text ?? "";
  const lines = [`📖 ${entry.word}${phonetic ? ` ${phonetic}` : ""}`, ""];
  for (const meaning of entry.meanings) {
    for (const def of meaning.definitions ?? []) {
      if (!def.definition) continue;
      lines.push(`${meaning.partOfSpeech ?? "?"}: ${def.definition}`);
      if (def.example) lines.push(`  "${def.example}"`);
    }
  }
  return { kind: "text", payload: lines.join("\n").trimEnd() };
}
