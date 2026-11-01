/** Pure timeline geometry for the Autopsy_Report view (autopsy-mode Requirement 3.1, 3.2). */
import type { AutopsyWindow } from "@doppelganger/contracts";

export interface Point {
  x: number;
  y: number;
}

/** Smoothed score as a polyline: x at each window's start, y from 1 (top) to 0 (bottom). */
export function scorePoints(
  windows: readonly AutopsyWindow[],
  durationS: number,
  width: number,
  height: number,
): Point[] {
  if (!(durationS > 0)) return [];
  return windows
    .filter((w) => w.smoothed !== null)
    .map((w) => ({ x: (w.startS / durationS) * width, y: (1 - (w.smoothed ?? 0)) * height }));
}

export function yOf(score: number, height: number): number {
  return (1 - Math.min(1, Math.max(0, score))) * height;
}

export function xOf(seconds: number, durationS: number, width: number): number {
  return durationS > 0 ? (Math.min(durationS, Math.max(0, seconds)) / durationS) * width : 0;
}

/** Seconds under a horizontal position. */
export function timeAt(x: number, width: number, durationS: number): number {
  if (!(width > 0)) return 0;
  return Math.min(durationS, Math.max(0, (x / width) * durationS));
}

/** One step for the arrow keys: one hop (the distance between window starts). */
export function stepSeconds(windows: readonly AutopsyWindow[], fallback = 1): number {
  const a = windows[0];
  const b = windows[1];
  return a !== undefined && b !== undefined && b.startS > a.startS ? b.startS - a.startS : fallback;
}

export const VERDICT_LABELS = {
  "likely-human": "Likely human",
  inconclusive: "Inconclusive",
  "likely-synthetic": "Likely synthetic",
} as const;
