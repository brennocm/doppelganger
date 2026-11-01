/**
 * The Spectre: canvas renderer for the band levels (haunted-ui Requirement 2). Colors come
 * from the `--spectre-stroke` custom property set by states.css; nothing is hard-coded.
 */
import type { HauntingState } from "@doppelganger/contracts";
import {
  catmullRom,
  createDisplacementScheduler,
  jitter,
  mirror,
  type Point,
  type Slice,
  TEAR_GAP,
  tear,
  wavePoints,
} from "./spectre-geometry.ts";

export interface SpectreFrame {
  bands: Float32Array;
  state: HauntingState;
  /** 0..1: Unease jitter strength. */
  intensity: number;
}

export type Motion = "full" | "reduced";

export interface Spectre {
  draw(frame: SpectreFrame): void;
  pause(): void;
  resume(): void;
  setMotion(motion: Motion): void;
  dispose(): void;
}

const FRAME_MS = 1000 / 30;
const JITTER_MS = 125; // 8 Hz
const STATIC_SEED = 1031;

function curve(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  const first = points[0];
  if (first === undefined) return;
  ctx.moveTo(first.x, first.y);
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i] as Point;
    const p2 = points[i + 1] as Point;
    const [c1, c2] = catmullRom(points[i - 1] ?? p1, p1, p2, points[i + 2] ?? p2);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
  }
}

/**
 * The shape per state, so the waveform differs even where colors are close: Idle flat,
 * Listening a slow breath, Exorcised a damped version settling back to calm.
 */
export function shapeFor(
  state: HauntingState,
  bands: Float32Array,
  t: number,
  motion: Motion,
): Float32Array {
  if (state === "idle") return new Float32Array(bands.length);
  if (state === "listening") {
    const phase = motion === "full" ? Math.sin((2 * Math.PI * t) / 4000) : 0;
    return new Float32Array(bands.length).fill(0.14 + 0.08 * phase);
  }
  if (state === "exorcised") return bands.map((v) => v * 0.45);
  return bands;
}

export function createSpectre(
  canvas: HTMLCanvasElement,
  initialMotion: Motion,
  now: () => number = () => performance.now(),
  /** Called each time a new tear is drawn (tests and diagnostics). */
  onTear: (t: number) => void = () => undefined,
): Spectre {
  const ctx = canvas.getContext("2d");
  let motion = initialMotion;
  let frame: SpectreFrame | null = null;
  let paused = false;
  let raf = 0;
  let lastDraw = Number.NEGATIVE_INFINITY;
  const scheduler = createDisplacementScheduler();
  let slices: Slice[] = [];
  let tearSeed = STATIC_SEED;

  function size(): { w: number; h: number } {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h };
  }

  function render(t: number): void {
    if (ctx === null || frame === null) return;
    const { w, h } = size();
    const stroke = getComputedStyle(canvas).getPropertyValue("--spectre-stroke").trim();
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2 * Math.min(2, globalThis.devicePixelRatio || 1);
    ctx.strokeStyle = stroke;
    const bands = shapeFor(frame.state, frame.bands, t, motion);
    let upper = wavePoints(bands, w, h);
    if (frame.state === "unease") {
      const seed = motion === "full" ? Math.floor(t / JITTER_MS) : STATIC_SEED;
      upper = jitter(upper, frame.intensity, seed);
    }
    const lower = mirror(upper, h);
    if (frame.state !== "possession") {
      ctx.beginPath();
      curve(ctx, upper);
      curve(ctx, lower);
      ctx.stroke();
      return;
    }
    // Possession: torn slices. The scheduler is the only gate for a new tear (at most one
    // every 340 ms, so ≤ 3 per second), whatever the state or motion did before; under
    // reduced motion the first tear stays. Until the first tear, the wave is drawn whole.
    if ((slices.length === 0 || motion === "full") && scheduler.tick(t)) {
      tearSeed = motion === "full" ? Math.floor(t) + 1 : STATIC_SEED;
      slices = tear(h, tearSeed);
      onTear(t);
    }
    if (slices.length === 0) {
      ctx.beginPath();
      curve(ctx, upper);
      curve(ctx, lower);
      ctx.stroke();
      return;
    }
    const scale = w / Math.max(1, canvas.clientWidth);
    for (const slice of slices) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        0,
        slice.top + TEAR_GAP * scale,
        w,
        Math.max(0, slice.bottom - slice.top - TEAR_GAP * scale),
      );
      ctx.clip();
      ctx.translate(slice.dx * scale, slice.dy * scale);
      ctx.beginPath();
      curve(ctx, upper);
      curve(ctx, lower);
      ctx.stroke();
      ctx.restore();
    }
  }

  function loop(): void {
    raf = 0;
    if (paused || frame === null) return;
    const t = now();
    if (t - lastDraw >= FRAME_MS) {
      lastDraw = t;
      render(t);
    }
    // Keep animating only where the state moves by itself.
    const animated =
      motion === "full" &&
      (frame.state === "listening" || frame.state === "unease" || frame.state === "possession");
    if (animated) raf = requestAnimationFrame(loop);
  }

  function schedule(): void {
    if (raf === 0 && !paused) raf = requestAnimationFrame(loop);
  }

  return {
    draw(next) {
      // A state change starts a fresh tear, but the scheduler keeps its history, so
      // leaving and re-entering Possession can never exceed 3 tears per second.
      if (frame?.state !== next.state) slices = [];
      frame = next;
      lastDraw = Number.NEGATIVE_INFINITY;
      schedule();
    },
    pause() {
      paused = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    },
    resume() {
      paused = false;
      schedule();
    },
    setMotion(next) {
      motion = next;
      slices = [];
      schedule();
    },
    dispose() {
      paused = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      frame = null;
    },
  };
}
