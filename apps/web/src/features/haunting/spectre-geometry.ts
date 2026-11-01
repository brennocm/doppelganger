/**
 * Pure Spectre geometry (haunted-ui design, Spectre): wave points from band levels, the
 * Unease jitter, the Possession tear, and the ≤ 3 Hz displacement scheduler.
 */

export interface Point {
  x: number;
  y: number;
}

/** Seeded LCG in [0, 1), so a seed always gives the same jitter or tear. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Upper half of a symmetric wave: one point per band, x across the width. */
export function wavePoints(bands: ArrayLike<number>, width: number, height: number): Point[] {
  const n = bands.length;
  const mid = height / 2;
  const amplitude = (height / 2) * 0.9;
  if (n === 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const level = Math.min(1, Math.max(0, bands[i] ?? 0));
    // Taper the ends so the wave closes at the edges.
    const taper = Math.sin((Math.PI * (i + 0.5)) / n);
    return { x: n === 1 ? width / 2 : (i / (n - 1)) * width, y: mid - level * amplitude * taper };
  });
}

/** The mirrored lower half. */
export function mirror(points: readonly Point[], height: number): Point[] {
  return points.map((p) => ({ x: p.x, y: height - p.y }));
}

/** Unease: per-point vertical jitter of up to `intensity × 6` px; reseeded at 8 Hz by the caller. */
export function jitter(points: readonly Point[], intensity: number, seed: number): Point[] {
  const next = seeded(seed);
  const reach = Math.min(1, Math.max(0, intensity)) * 6;
  return points.map((p) => ({ x: p.x, y: p.y + (next() * 2 - 1) * reach }));
}

export interface Slice {
  top: number;
  bottom: number;
  dx: number;
  dy: number;
}

/** Gap left between torn slices, in px, so the tear reads at a glance. */
export const TEAR_GAP = 3;

/** Possession: 6 to 10 horizontal slices, each displaced by up to 24 px across and 8 px down. */
export function tear(height: number, seed: number): Slice[] {
  const next = seeded(seed);
  const count = 6 + Math.floor(next() * 5);
  const cuts = Array.from({ length: count - 1 }, () => next() * height).sort((a, b) => a - b);
  const edges = [0, ...cuts, height];
  return edges.slice(1).map((bottom, i) => ({
    top: edges[i] ?? 0,
    bottom,
    dx: (next() * 2 - 1) * 24,
    dy: (next() * 2 - 1) * 8,
  }));
}

/** Unease intensity: how far the score is above `unease`, scaled to the band up to `possession`. */
export function uneaseIntensity(score: number, unease: number, possession: number): number {
  if (!(possession > unease)) return score >= unease ? 1 : 0;
  return Math.min(1, Math.max(0, (score - unease) / (possession - unease)));
}

/** Minimum gap between displacement updates: more than 1000/3 ms, so ≤ 3 in any second. */
export const MIN_DISPLACEMENT_GAP_MS = 340;

export interface DisplacementScheduler {
  /** True when a new tear may be drawn at time `now` (ms); records it if so. */
  tick(now: number): boolean;
  reset(): void;
}

export function createDisplacementScheduler(
  gapMs = MIN_DISPLACEMENT_GAP_MS,
): DisplacementScheduler {
  let last = Number.NEGATIVE_INFINITY;
  return {
    tick(now) {
      if (!Number.isFinite(now) || now - last < gapMs) return false;
      last = now;
      return true;
    },
    reset() {
      last = Number.NEGATIVE_INFINITY;
    },
  };
}

/** Catmull-Rom control points between p1 and p2, for canvas bezierCurveTo. */
export function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point): [Point, Point] {
  return [
    { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
  ];
}
