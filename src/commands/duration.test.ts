// Unit tests for parseDuration (remind.ts).
// Design references: §2.5 (time parsing), §8.3 (property-based testing).

import { describe, expect, it } from "vitest";

import {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  parseDuration,
} from "./remind";

describe("parseDuration — valid inputs", () => {
  it("parses '30m' as 1,800,000 ms", () => {
    const r = parseDuration("30m");
    expect(r.ok).toBe(true);
    expect(r.milliseconds).toBe(1_800_000);
    expect(r.error).toBeUndefined();
  });

  it("parses '1h30m' as 5,400,000 ms (combined units sum)", () => {
    const r = parseDuration("1h30m");
    expect(r.ok).toBe(true);
    expect(r.milliseconds).toBe(5_400_000);
    expect(r.error).toBeUndefined();
  });

  it("parses '2d4h' as 187,200,000 ms (combined units sum)", () => {
    const r = parseDuration("2d4h");
    expect(r.ok).toBe(true);
    expect(r.milliseconds).toBe(187_200_000);
    expect(r.error).toBeUndefined();
  });

  it("accepts the minimum duration '1s' (== MIN_DURATION_MS)", () => {
    const r = parseDuration("1s");
    expect(r.ok).toBe(true);
    expect(r.milliseconds).toBe(MIN_DURATION_MS);
  });

  it("accepts the maximum duration '30d' (== MAX_DURATION_MS)", () => {
    const r = parseDuration("30d");
    expect(r.ok).toBe(true);
    expect(r.milliseconds).toBe(MAX_DURATION_MS);
  });

  it("parses uppercase units case-insensitively ('1H', '2D')", () => {
    expect(parseDuration("1H").milliseconds).toBe(3_600_000);
    expect(parseDuration("2D").milliseconds).toBe(172_800_000);
  });

  it("allows optional whitespace between number and unit", () => {
    const r = parseDuration("1 h 30 m");
    expect(r.ok).toBe(true);
    expect(r.milliseconds).toBe(5_400_000);
  });

  it("trims leading/trailing whitespace before parsing", () => {
    const r = parseDuration("  30m  ");
    expect(r.ok).toBe(true);
    expect(r.milliseconds).toBe(1_800_000);
  });
});

describe("parseDuration — invalid inputs", () => {
  it("rejects empty string with an error", () => {
    const r = parseDuration("");
    expect(r.ok).toBe(false);
    expect(r.milliseconds).toBe(0);
    expect(r.error).toBeTypeOf("string");
    expect(r.error).toContain("empty");
  });

  it("rejects whitespace-only string with an error", () => {
    const r = parseDuration("   ");
    expect(r.ok).toBe(false);
    expect(r.milliseconds).toBe(0);
    expect(r.error).toBeTypeOf("string");
  });

  it("rejects 'abc' (no valid tokens) with an error", () => {
    const r = parseDuration("abc");
    expect(r.ok).toBe(false);
    expect(r.milliseconds).toBe(0);
    expect(r.error).toBeTypeOf("string");
  });

  it("rejects '0s' (below the 1s minimum) with an error", () => {
    const r = parseDuration("0s");
    expect(r.ok).toBe(false);
    expect(r.milliseconds).toBe(0);
    expect(r.error).toBeTypeOf("string");
    // The minimum bound is 1 second.
    expect(r.error).toMatch(/second|minimum|min/i);
  });

  it("rejects '31d' (above the 30d maximum) with an error", () => {
    const r = parseDuration("31d");
    expect(r.ok).toBe(false);
    expect(r.milliseconds).toBe(0);
    expect(r.error).toBeTypeOf("string");
    // The maximum bound is 30 days.
    expect(r.error).toMatch(/day|maximum|max|exceed/i);
  });

  it("rejects garbage between tokens ('1h abc 30m')", () => {
    const r = parseDuration("1h abc 30m");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTypeOf("string");
  });

  it("rejects trailing garbage after tokens ('30m xyz')", () => {
    const r = parseDuration("30m xyz");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTypeOf("string");
  });

  it("rejects a number with no unit ('45')", () => {
    const r = parseDuration("45");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTypeOf("string");
  });

  it("rejects an unsupported unit ('30w')", () => {
    const r = parseDuration("30w");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTypeOf("string");
  });
});
