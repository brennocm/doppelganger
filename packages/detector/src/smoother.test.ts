import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RUNS } from "./property-runs.ts";
import { createSmoother } from "./smoother.ts";
import { ConfigError } from "./windower.ts";

describe("createSmoother", () => {
  it("starts at the first score and then averages exponentially", () => {
    const smoother = createSmoother(0.5);
    expect(smoother.next(0.8)).toBe(0.8);
    expect(smoother.next(0.2)).toBeCloseTo(0.5, 12);
    expect(smoother.next(0.2)).toBeCloseTo(0.35, 12);
  });

  it("follows the input exactly when alpha is 1", () => {
    const smoother = createSmoother(1);
    expect([0.1, 0.9, 0.3].map((s) => smoother.next(s))).toEqual([0.1, 0.9, 0.3]);
  });

  it("forgets history on reset", () => {
    const smoother = createSmoother(0.4);
    smoother.next(1);
    smoother.reset();
    expect(smoother.next(0)).toBe(0);
  });

  it.each([0, -0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY])("rejects alpha %s", (alpha) => {
    expect(() => createSmoother(alpha)).toThrow(ConfigError);
  });

  it("rejects non-finite scores", () => {
    expect(() => createSmoother(0.4).next(Number.NaN)).toThrow(RangeError);
  });

  // Feature: detection-core, Property 5: Smoother stays in range
  it("keeps every smoothed value between the min and max of the scores so far", () => {
    fc.assert(
      fc.property(
        fc.double({ min: Number.MIN_VALUE, max: 1, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 300 }),
        (alpha, scores) => {
          const smoother = createSmoother(alpha);
          let lo = Number.POSITIVE_INFINITY;
          let hi = Number.NEGATIVE_INFINITY;
          for (const s of scores) {
            lo = Math.min(lo, s);
            hi = Math.max(hi, s);
            const smoothed = smoother.next(s);
            expect(smoothed).toBeGreaterThanOrEqual(lo);
            expect(smoothed).toBeLessThanOrEqual(hi);
          }
        },
      ),
      RUNS,
    );
  });
});
