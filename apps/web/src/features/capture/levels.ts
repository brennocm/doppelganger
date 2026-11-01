/**
 * 64-band level summary for the Spectre (haunted-ui design, P26). Derived features, not
 * audio: 64 numbers in [0, 1] per 100 ms chunk, posted as a plain array.
 */

export const BANDS = 64;
export const FFT_SIZE = 512;
const RATE = 16000;
const LOW_HZ = 80;
const HIGH_HZ = 8000;
const FLOOR_DB = -80;
const CEIL_DB = -10;

const HANN = Float64Array.from(
  { length: FFT_SIZE },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)),
);
const WINDOW_GAIN = HANN.reduce((a, b) => a + b, 0) / 2;

/** FFT-bin edges of 64 log-spaced bands; each band has at least one bin. */
const EDGES: readonly number[] = (() => {
  const edges: number[] = [];
  const binHz = RATE / FFT_SIZE;
  for (let b = 0; b <= BANDS; b++) {
    const hz = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (b / BANDS);
    edges.push(Math.min(FFT_SIZE / 2, Math.round(hz / binHz)));
  }
  for (let b = 1; b <= BANDS; b++) edges[b] = Math.max(edges[b] ?? 0, (edges[b - 1] ?? 0) + 1);
  return edges.map((e) => Math.min(e, FFT_SIZE / 2));
})();

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(step * k);
        const wi = Math.sin(step * k);
        const a = start + k;
        const b = a + size / 2;
        const xr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const xi = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
      }
    }
  }
}

/** Levels of the last FFT_SIZE samples (zero-padded when shorter); non-finite samples count as 0. */
export function bandLevels(samples: ArrayLike<number>): number[] {
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const offset = Math.max(0, samples.length - FFT_SIZE);
  for (let i = 0; i < FFT_SIZE && offset + i < samples.length; i++) {
    const v = samples[offset + i] ?? 0;
    re[i] = (Number.isFinite(v) ? v : 0) * (HANN[i] ?? 0);
  }
  fft(re, im);
  const levels: number[] = [];
  for (let b = 0; b < BANDS; b++) {
    const from = EDGES[b] ?? 0;
    const to = Math.max(from + 1, EDGES[b + 1] ?? from + 1);
    let peak = 0;
    for (let k = from; k < to && k <= FFT_SIZE / 2; k++) {
      peak = Math.max(peak, Math.hypot(re[k] ?? 0, im[k] ?? 0) / WINDOW_GAIN);
    }
    const db = 20 * Math.log10(peak + 1e-12);
    levels.push(Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB))));
  }
  return levels;
}

/** The band whose range holds a frequency (for tests and labels). */
export function bandOf(hz: number): number {
  const bin = Math.round(hz / (RATE / FFT_SIZE));
  for (let b = 0; b < BANDS; b++) if (bin < (EDGES[b + 1] ?? 0)) return b;
  return BANDS - 1;
}
