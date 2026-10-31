// Unit tests for /define (design §6.3, §8.2).
// Authored by the agent (Kiro CLI throttled).

import { afterEach, describe, expect, it, vi } from "vitest";

import { defineHandler } from "./define";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const HELLO = [
  {
    word: "hello",
    phonetic: "/həˈloʊ/",
    phonetics: [{ text: "/həˈloʊ/", audio: "" }],
    meanings: [
      {
        partOfSpeech: "noun",
        definitions: [
          { definition: "an utterance of 'hello'", example: "Hello, how are you?" },
        ],
      },
      {
        partOfSpeech: "interjection",
        definitions: [{ definition: "used as a greeting" }],
      },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defineHandler", () => {
  it("formats a valid entry with multiple meanings, POS tags and phonetic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(HELLO)));
    const r = await defineHandler("hello");
    expect(r.kind).toBe("text");
    expect(r.payload).toBe(
      "📖 hello /həˈloʊ/\n\n" +
        'noun: an utterance of \'hello\'\n  "Hello, how are you?"\n' +
        "interjection: used as a greeting",
    );
  });

  it("replies in-character on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    const r = await defineHandler("zxqvbnm");
    expect(r.payload).toBe(
      "I don't have a definition for that. Maybe it's not a real word?",
    );
  });

  it("works when phonetic is missing", async () => {
    const noPhonetic = [
      { ...HELLO[0], phonetic: undefined, phonetics: [] },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(noPhonetic)));
    const r = await defineHandler("hello");
    expect(String(r.payload)).toContain("📖 hello\n");
    expect(String(r.payload)).not.toContain("undefined");
  });

  it("returns an in-character error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const r = await defineHandler("hello");
    expect(r.kind).toBe("error");
    expect(r.payload).toContain("dictionary");
  });

  it("requires a word argument", async () => {
    const r = await defineHandler(undefined);
    expect(r.kind).toBe("error");
    expect(r.payload).toContain("Usage: /define");
  });
});
