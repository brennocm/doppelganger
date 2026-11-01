import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BANDS, bandLevels, bandOf } from "./levels.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;
const tone = (hz: number, n = 1600, a = 0.5) =>
  Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * hz * i) / 16000));

describe("bandLevels", () => {
  it("gives 64 zeros for silence and for an empty chunk", () => {
    expect(bandLevels(new Float32Array(1600))).toEqual(Array(BANDS).fill(0));
    expect(bandLevels([])).toEqual(Array(BANDS).fill(0));
  });

  it.each([200, 1000, 3000, 6000])("puts a %i Hz tone's peak in its own band", (hz) => {
    const levels = bandLevels(tone(hz));
    const peak = levels.indexOf(Math.max(...levels));
    expect(Math.abs(peak - bandOf(hz))).toBeLessThanOrEqual(1);
    expect(levels[peak]).toBeGreaterThan(0.8);
  });

  it("returns plain numbers in [0, 1] for any chunk, including NaN and infinities", () => {
    const sample = fc.oneof(
      fc.float({ min: -1, max: 1, noNaN: true }),
      fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1, -1),
    );
    fc.assert(
      fc.property(fc.array(sample, { maxLength: 2000 }), (chunk) => {
        const levels = bandLevels(chunk);
        expect(Array.isArray(levels)).toBe(true);
        expect(levels).toHaveLength(BANDS);
        for (const v of levels) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }),
      RUNS,
    );
  });
});
