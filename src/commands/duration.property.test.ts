import { describe, expect } from "vitest";
import { fc, it } from "@fast-check/vitest";
import {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  parseDuration,
} from "./remind";

/** Arbitrary for a single valid unit letter. */
const fcUnit = fc.constantFrom("s", "m", "h", "d");

/** Arbitrary for a small positive integer count (1–99). */
const fcCount = fc.integer({ min: 1, max: 99 });

/**
 * Arbitrary for a single valid duration token like "3m" or "45s".
 */
const fcToken = fc.tuple(fcCount, fcUnit).map(([n, u]) => `${n}${u}`);

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Independent (non-SUT) millisecond evaluator for generated duration
 * strings. Used only to keep generated inputs inside the documented
 * valid range; never used as the expected value in assertions.
 */
function independentMs(duration: string): number {
  let total = 0;
  for (const m of duration.matchAll(/(\d+)([smhd])/g)) {
    total += Number(m[1]) * UNIT_MS[m[2]];
  }
  return total;
}

/** In-range duration: 1–3 concatenated tokens whose total is within [MIN, MAX]. */
const fcDurationInRange = fc
  .array(fcToken, { minLength: 1, maxLength: 3 })
  .map((tokens) => tokens.join(""))
  .filter((s) => {
    const ms = independentMs(s);
    return ms >= MIN_DURATION_MS && ms <= MAX_DURATION_MS;
  });

/** Out-of-range duration: single token strictly above the 30-day maximum. */
const fcDurationTooLong = fc
  .tuple(fc.integer({ min: 31, max: 9999 }), fc.constant("d"))
  .map(([n, u]) => `${n}${u}`);

/** Arbitrary for garbage: ASCII strings that are NOT valid duration tokens. */
const fcGarbage = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !/^(\d+\s*[smhd]\s*)+$/i.test(s.trim()));

describe("parseDuration — property tests", () => {
  // Property 1: in-range valid token strings always produce a positive total.
  it.prop([fcDurationInRange])(
    "in-range valid token strings always produce a positive millisecond total",
    (duration: string) => {
      const r = parseDuration(duration);
      expect(r.ok).toBe(true);
      expect(r.milliseconds).toBeGreaterThan(0);
    },
  );

  // Property 2: combining two in-range durations sums their contributions
  // correctly when the combination stays within the documented maximum.
  it.prop([fcDurationInRange, fcDurationInRange])(
    "combined in-range durations sum correctly (parse(a)+parse(b) == parse(a+b))",
    (a: string, b: string) => {
      fc.pre(independentMs(a) + independentMs(b) <= MAX_DURATION_MS);
      const ra = parseDuration(a);
      const rb = parseDuration(b);
      expect(ra.ok).toBe(true);
      expect(rb.ok).toBe(true);

      const combined = parseDuration(a + b);
      expect(combined.ok).toBe(true);
      expect(combined.milliseconds).toBe(ra.milliseconds + rb.milliseconds);
    },
  );

  // Property 3: garbage strings never parse successfully.
  it.prop([fcGarbage])(
    "garbage strings never parse successfully",
    (input: string) => {
      const r = parseDuration(input);
      expect(r.ok).toBe(false);
      expect(r.milliseconds).toBe(0);
      expect(r.error).toBeTypeOf("string");
    },
  );

  // Property 4: a successful parse never exceeds the 30-day maximum.
  it.prop([fcDurationInRange])(
    "a successful parse never exceeds the 30-day maximum",
    (duration: string) => {
      const r = parseDuration(duration);
      if (r.ok) {
        expect(r.milliseconds).toBeLessThanOrEqual(MAX_DURATION_MS);
        expect(r.milliseconds).toBeGreaterThanOrEqual(MIN_DURATION_MS);
      }
    },
  );

  // Property 5 (boundary rejection): anything strictly above the 30-day
  // maximum is always rejected. Found by property 1's original run ("31d").
  it.prop([fcDurationTooLong])(
    "durations above the 30-day maximum are always rejected",
    (duration: string) => {
      const r = parseDuration(duration);
      expect(r.ok).toBe(false);
    },
  );

  // Explicit boundary cases preserved from the original failing seeds.
  it.prop([fc.constant("31d"), fc.constant("30d1s"), fc.constant("30d0h1s")])(
    "documented boundary violations are rejected (31d, 30d1s, 30d0h1s)",
    (duration: string) => {
      expect(parseDuration(duration).ok).toBe(false);
    },
  );

  // Exact upper boundary stays accepted: 30 days exactly is in range.
  it.prop([fc.constant("30d")])(
    "exactly 30 days remains accepted (inclusive upper bound)",
    (duration: string) => {
      const r = parseDuration(duration);
      expect(r.ok).toBe(true);
      expect(r.milliseconds).toBe(MAX_DURATION_MS);
    },
  );
});
