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

/** A gentle breathing shape for Listening (low, slow). */
function breath(n: number, t: number): Float32Array {
  const level = 0.06 + 0.04 * Math.sin((2 * Math.PI * t) / 4000);
  return new Float32Array(n).fill(level);
}

export function createSpectre(
  canvas: HTMLCanvasElement,
  initialMotion: Motion,
  now: () => number = () => performance.now(),
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
    const bands = frame.state === "listening" ? breath(frame.bands.length, t) : frame.bands;
    let upper =
      frame.state === "idle" ? wavePoints(new Float32Array(64), w, h) : wavePoints(bands, w, h);
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
    // Possession: torn slices. New displacement at most every 340 ms (≤ 3 per second);
    // under reduced motion a single static tear.
    if (slices.length === 0 || (motion === "full" && scheduler.tick(t))) {
      tearSeed = motion === "full" ? Math.floor(t) + 1 : STATIC_SEED;
      slices = tear(h, tearSeed);
    }
    for (const slice of slices) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, slice.top, w, slice.bottom - slice.top);
      ctx.clip();
      ctx.translate(slice.dx * (w / Math.max(1, canvas.clientWidth)), 0);
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
      if (frame?.state !== next.state) {
        slices = [];
        scheduler.reset();
      }
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
