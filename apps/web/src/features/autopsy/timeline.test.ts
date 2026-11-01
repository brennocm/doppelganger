import type { AutopsyWindow } from "@doppelganger/contracts";
import { describe, expect, it } from "vitest";
import { scorePoints, stepSeconds, timeAt, xOf, yOf } from "./timeline.ts";

const w = (i: number, smoothed: number | null): AutopsyWindow => ({
  index: i,
  startS: i,
  endS: i + 4,
  voiced: smoothed !== null,
  score: smoothed,
  smoothed,
});

describe("timeline geometry", () => {
  it("maps scores and times into the canvas and back", () => {
    expect(scorePoints([w(0, 1), w(1, null), w(2, 0)], 4, 400, 100)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 100 },
    ]);
    expect(yOf(0.7, 100)).toBeCloseTo(30, 10);
    expect(xOf(2, 4, 400)).toBe(200);
    expect(timeAt(300, 400, 8)).toBe(6);
    expect(timeAt(-5, 400, 8)).toBe(0);
    expect(timeAt(500, 400, 8)).toBe(8);
  });

  it("steps one hop with the arrow keys", () => {
    expect(stepSeconds([w(0, 0.1), w(1, 0.1)])).toBe(1);
    expect(stepSeconds([])).toBe(1);
  });

  it("draws nothing for an empty recording", () => {
    expect(scorePoints([], 0, 400, 100)).toEqual([]);
  });
});
