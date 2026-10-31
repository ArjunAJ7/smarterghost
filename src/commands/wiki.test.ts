// Unit tests for /wiki (design §6.2, §8.2).
// Authored by the agent (Kiro CLI throttled).

import { afterEach, describe, expect, it, vi } from "vitest";

import { truncateWords, wikiHandler } from "./wiki";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const EINSTEIN = {
  title: "Albert Einstein",
  extract: "Albert Einstein was a German-born theoretical physicist.",
  content_urls: {
    desktop: { page: "https://en.wikipedia.org/wiki/Albert_Einstein" },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wikiHandler", () => {
  it("returns a formatted summary for a valid topic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(EINSTEIN)));
    const r = await wikiHandler("albert einstein");
    expect(r.kind).toBe("text");
    expect(r.payload).toBe(
      "📚 Albert Einstein\n" +
        "Albert Einstein was a German-born theoretical physicist.\n" +
        "[Read more: https://en.wikipedia.org/wiki/Albert_Einstein]",
    );
    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("albert_einstein");
  });

  it("truncates extracts longer than 300 words on word boundaries", async () => {
    const longExtract = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...EINSTEIN, extract: longExtract })),
    );
    const r = await wikiHandler("albert einstein");
    const body = String(r.payload).split("\n")[1];
    expect(body.endsWith("...")).toBe(true);
    expect(body.replace(/ ...$/, "").split(" ").length).toBe(300);
    expect(body).toContain("word299");
    expect(body).not.toContain("word300");
  });

  it("falls back to search redirect on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ pages: [{ title: "Albert Einstein" }] }))
      .mockResolvedValueOnce(jsonResponse(EINSTEIN));
    vi.stubGlobal("fetch", fetchMock);
    const r = await wikiHandler("albert einstien");
    expect(r.kind).toBe("text");
    expect(String(r.payload)).toContain("Albert Einstein");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("search/title");
  });

  it("replies in-character when nothing is found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ pages: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await wikiHandler("zxqvbnm");
    expect(r.payload).toBe(
      "I couldn't find anything about that. Try a different topic?",
    );
  });

  it("returns an in-character error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const r = await wikiHandler("physics");
    expect(r.kind).toBe("error");
    expect(r.payload).toContain("encyclopedia");
  });

  it("requires a topic argument", async () => {
    const r = await wikiHandler(undefined);
    expect(r.kind).toBe("error");
    expect(r.payload).toContain("Usage: /wiki");
  });
});

describe("truncateWords", () => {
  it("returns short text unchanged", () => {
    expect(truncateWords("one two three")).toBe("one two three");
  });

  it("truncates at exactly the word limit with ellipsis", () => {
    const text = Array.from({ length: 301 }, (_, i) => `w${i}`).join(" ");
    const out = truncateWords(text);
    expect(out.split(" ").length).toBe(301); // 300 words + "..."
    expect(out.endsWith("...")).toBe(true);
  });
});
