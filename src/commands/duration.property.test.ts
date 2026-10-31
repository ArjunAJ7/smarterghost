// Property-based tests for parseDuration (remind.ts).
// Design references: §2.5 (time parsing), §8.3 (property-based testing).
//
// Uses @fast-check/vitest's `it.prop` API to run generative tests. The
// `it` object here is the augmented one from @fast-check/vitest which
// exposes `.prop` and also re-exports `fc` (fast-check's arbitrary
// builders).

import { describe, expect } from "vitest";

import { it, fc } from "@fast-check/vitest";

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
 * Numbers are positive (>= 1) so the token contributes a positive amount.
 */
const fcToken = fc.tuple(fcCount, fcUnit).map(([n, u]) => `${n}${u}`);

/** Arbitrary for a non-empty duration string made of 1–3 concatenated tokens. */
const fcDuration = fc
  .array(fcToken, { minLength: 1, maxLength: 3 })
  .map((tokens) => tokens.join(""));

/** Arbitrary for garbage: ASCII strings that are NOT valid duration tokens. */
const fcGarbage = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !/^(\d+\s*[smhd]\s*)+$/i.test(s.trim()));

describe("parseDuration — property tests", () => {
  // Property 1: valid tokens always produce a positive millisecond total.
  it.prop([fcDuration])(
    "valid token strings always produce a positive millisecond total",
    (duration: string) => {
      const r = parseDuration(duration);
      expect(r.ok).toBe(true);
      expect(r.milliseconds).toBeGreaterThan(0);
    },
  );

  // Property 2: combining two valid durations sums their contributions
  // correctly. We compare parse(a)+parse(b) against parse(a+b). Because
  // each token is a number>=1 with a valid unit, the concatenation is
  // itself a valid duration string, so all three parses should succeed.
  it.prop([fcToken, fcToken])(
    "combined durations sum correctly (parse(a)+parse(b) == parse(a+b))",
    (a: string, b: string) => {
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
  it.prop([fcDuration])(
    "a successful parse never exceeds the 30-day maximum",
    (duration: string) => {
      const r = parseDuration(duration);
      // If it parsed, it must be within bounds.
      if (r.ok) {
        expect(r.milliseconds).toBeLessThanOrEqual(MAX_DURATION_MS);
      }
      // We also assert the documented lower bound holds for any ok result.
      if (r.ok) {
        expect(r.milliseconds).toBeGreaterThanOrEqual(MIN_DURATION_MS);
      }
    },
  );
});
