import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createDisplacementScheduler,
  jitter,
  mirror,
  tear,
  uneaseIntensity,
  wavePoints,
} from "./spectre-geometry.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;

describe("Spectre geometry", () => {
  it("draws a flat line for silence and a symmetric wave for levels", () => {
    expect(wavePoints(new Array(64).fill(0), 640, 100).every((p) => p.y === 50)).toBe(true);
    const upper = wavePoints(new Array(64).fill(1), 640, 100);
    const lower = mirror(upper, 100);
    upper.forEach((p, i) => {
      expect(p.y + (lower[i]?.y ?? 0)).toBeCloseTo(100, 10);
    });
    expect(wavePoints([], 640, 100)).toEqual([]);
  });

  it("jitters by at most intensity × 6 px, the same way for the same seed", () => {
    const base = wavePoints(new Array(64).fill(0.5), 640, 100);
    const a = jitter(base, 0.5, 7);
    expect(a).toEqual(jitter(base, 0.5, 7));
    a.forEach((p, i) => {
      expect(Math.abs(p.y - (base[i]?.y ?? 0))).toBeLessThanOrEqual(3);
    });
    expect(jitter(base, 0, 7)).toEqual(base);
  });

  it("tears into 6 to 10 slices covering the height, each displaced by at most 24 px", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 400 }), (seed, height) => {
        const slices = tear(height, seed);
        expect(slices.length).toBeGreaterThanOrEqual(6);
        expect(slices.length).toBeLessThanOrEqual(10);
        expect(slices[0]?.top).toBe(0);
        expect(slices.at(-1)?.bottom).toBe(height);
        for (const s of slices) expect(Math.abs(s.dx)).toBeLessThanOrEqual(24);
      }),
      RUNS,
    );
  });

  it("scales Unease jitter by the distance above the threshold", () => {
    expect(uneaseIntensity(0.4, 0.4, 0.7)).toBe(0);
    expect(uneaseIntensity(0.55, 0.4, 0.7)).toBeCloseTo(0.5, 10);
    expect(uneaseIntensity(0.9, 0.4, 0.7)).toBe(1);
    expect(uneaseIntensity(0.7, 0.7, 0.7)).toBe(1);
  });

  // Feature: haunted-ui, Property 3: Flash rate bound
  it("schedules at most 3 displacement updates in any 1-second window", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 200, noNaN: true }), { maxLength: 400 }),
        (gaps) => {
          const scheduler = createDisplacementScheduler();
          let t = 0;
          const updates: number[] = [];
          for (const gap of gaps) {
            t += gap;
            if (scheduler.tick(t)) updates.push(t);
          }
          for (let i = 0; i + 3 < updates.length; i++) {
            // Any 4 consecutive updates span more than one second.
            expect((updates[i + 3] ?? 0) - (updates[i] ?? 0)).toBeGreaterThan(1000);
          }
        },
      ),
      RUNS,
    );
  });
});
