// Unit tests for /news (design §6.4, §8.2).
// Authored by the agent (Kiro CLI throttled).

import { afterEach, describe, expect, it, vi } from "vitest";

import { newsHandler } from "./news";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const HITS = {
  hits: [
    { title: "Show HN: Thing", url: "https://example.com/1", points: 342, objectID: "1" },
    { title: "Second Post", url: "https://example.com/2", points: 100, objectID: "2" },
    { title: "Third Post", url: "https://example.com/3", points: 50, objectID: "3" },
    { title: "Fourth Post", url: "https://example.com/4", points: 25, objectID: "4" },
    { title: "Fifth Post", url: "https://example.com/5", points: 10, objectID: "5" },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newsHandler", () => {
  it("formats the top 5 front-page headlines with points and links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(HITS)));
    const r = await newsHandler();
    expect(r.kind).toBe("text");
    expect(r.payload).toBe(
      "📰 Top Headlines:\n" +
        "1. Show HN: Thing (342 points)\n   https://example.com/1\n" +
        "2. Second Post (100 points)\n   https://example.com/2\n" +
        "3. Third Post (50 points)\n   https://example.com/3\n" +
        "4. Fourth Post (25 points)\n   https://example.com/4\n" +
        "5. Fifth Post (10 points)\n   https://example.com/5",
    );
  });

  it("replies in-character when results are empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ hits: [] })));
    const r = await newsHandler();
    expect(String(r.payload)).toContain("No headlines");
  });

  it("returns an in-character error when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    const r = await newsHandler();
    expect(r.kind).toBe("error");
    expect(r.payload).toBe(
      "Can't reach the news feeds right now. Try again in a bit?",
    );
  });

  it("returns an in-character error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const r = await newsHandler();
    expect(r.kind).toBe("error");
    expect(r.payload).toContain("news feeds");
  });
});
