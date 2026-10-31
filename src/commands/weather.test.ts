// Unit tests for /weather (design §6.1, §8.2).
// Authored by the agent (Kiro CLI throttled).

import { afterEach, describe, expect, it, vi } from "vitest";

import { weatherHandler, wmoText } from "./weather";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const GEO = {
  results: [
    {
      latitude: 40.71,
      longitude: -74.01,
      name: "New York",
      country: "United States",
      admin1: "New York",
    },
  ],
};

const FORECAST = {
  current: {
    temperature_2m: 72.2,
    apparent_temperature: 74.1,
    relative_humidity_2m: 45,
    weather_code: 0,
    wind_speed_10m: 8.3,
  },
  daily: { weather_code: [0], temperature_2m_max: [78.4], temperature_2m_min: [62.1] },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("weatherHandler", () => {
  it("returns formatted weather for a valid location", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(GEO))
      .mockResolvedValueOnce(jsonResponse(FORECAST));
    vi.stubGlobal("fetch", fetchMock);

    const r = await weatherHandler("new york");
    expect(r.kind).toBe("text");
    expect(r.payload).toBe(
      "Weather for New York, New York:\n" +
        "72°F (feels like 74°F), Clear sky\n" +
        "Humidity: 45% | Wind: 8 mph\n" +
        "Today: H 78°F / L 62°F",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "geocoding-api.open-meteo.com",
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain("latitude=40.71");
  });

  it("replies in-character when geocoding finds nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    const r = await weatherHandler("zzz-not-a-place");
    expect(r.payload).toBe(
      "Hmm, I can't find that place. Try a city name or zip code?",
    );
  });

  it("returns an in-character error when the API times out / fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    const r = await weatherHandler("paris");
    expect(r.kind).toBe("error");
    expect(r.payload).toContain("weather wires");
  });

  it("requires a location argument", async () => {
    const r = await weatherHandler(undefined);
    expect(r.kind).toBe("error");
    expect(r.payload).toContain("Usage: /weather");
  });
});

describe("wmoText", () => {
  it("maps known WMO codes", () => {
    expect(wmoText(0)).toBe("Clear sky");
    expect(wmoText(61)).toBe("Light rain");
    expect(wmoText(3)).toBe("Overcast");
  });

  it("falls back for unknown codes", () => {
    expect(wmoText(1234)).toContain("1234");
  });
});
