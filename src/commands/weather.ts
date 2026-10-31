// /weather — Open-Meteo, no API key (design §6.1).
// Authored by the agent (Kiro CLI throttled); implements design §6.1 exactly.

import type { CommandResult } from "./registry";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 5_000;
const USER_AGENT = "SmarterGhost/1.0 (+https://smarterghost.arjun-vinod0028.workers.dev)";


/** WMO weather code → human-readable text (design §6.1). */
const WMO_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Light rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Light snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with light hail",
  99: "Thunderstorm with heavy hail",
};

export function wmoText(code: number): string {
  return WMO_CODES[code] ?? `Unknown conditions (code ${code})`;
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
  admin1?: string;
  population?: number;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function weatherHandler(
  args: string | undefined,
): Promise<CommandResult> {
  const location = args?.trim();
  if (!location) {
    return { kind: "error", payload: "Usage: /weather <location>" };
  }

  let geo: { results?: GeocodeResult[] };
  try {
    geo = (await fetchJson(
      `${GEOCODE_URL}?name=${encodeURIComponent(location)}&count=5&language=en&format=json`,
    )) as { results?: GeocodeResult[] };
  } catch {
    return {
      kind: "error",
      payload: "Ugh, the weather wires are crossed. Try again in a sec?",
    };
  }

  // Ambiguous names (e.g. Kochi, India vs Kochi, Japan): prefer the
  // largest-population match rather than the API's first hit.
  const place = geo.results
    ?.slice()
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
  if (!place) {
    return {
      kind: "text",
      payload: "Hmm, I can't find that place. Try a city name or zip code?",
    };
  }

  let forecast: {
    current?: {
      temperature_2m?: number;
      apparent_temperature?: number;
      relative_humidity_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
    daily?: {
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };
  try {
    forecast = (await fetchJson(
      `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=1` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`,
    )) as typeof forecast;
  } catch {
    return {
      kind: "error",
      payload: "Ugh, the weather wires are crossed. Try again in a sec?",
    };
  }

  const c = forecast.current;
  if (!c || c.temperature_2m === undefined) {
    return {
      kind: "error",
      payload: "Ugh, the weather wires are crossed. Try again in a sec?",
    };
  }

  const labelParts = [place.name, place.admin1, place.country].filter(
    (p): p is string => Boolean(p),
  );
  const label = [...new Set(labelParts)].join(", ");
  const lines = [
    `Weather for ${label}:`,
    `${Math.round(c.temperature_2m)}°F (feels like ${Math.round(
      c.apparent_temperature ?? c.temperature_2m,
    )}°F), ${wmoText(c.weather_code ?? -1)}`,
    `Humidity: ${c.relative_humidity_2m ?? "?"}% | Wind: ${Math.round(
      c.wind_speed_10m ?? 0,
    )} mph`,
  ];
  const hi = forecast.daily?.temperature_2m_max?.[0];
  const lo = forecast.daily?.temperature_2m_min?.[0];
  if (hi !== undefined && lo !== undefined) {
    lines.push(`Today: H ${Math.round(hi)}°F / L ${Math.round(lo)}°F`);
  }
  return { kind: "text", payload: lines.join("\n") };
}
