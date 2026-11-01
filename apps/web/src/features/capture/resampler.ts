/**
 * Pure audio primitives for the capture worklet (audio-capture Requirement 3): downmix to
 * mono and a causal windowed-sinc polyphase resampler to 16 kHz with carried state.
 * No DOM or Web Audio types, so they run in the worklet, in Node tests and anywhere else.
 */

export const TARGET_RATE = 16000;
export const TAPS = 32;
/** Output k is centred this many input samples before input position k·M/L. */
export const DELAY = TAPS / 2;
const PRECOMPUTE_LIMIT = 1024;

/** Average of the channels, computed in float64. Identical channels give that channel. */
export function downmix(channels: readonly ArrayLike<number>[]): Float32Array {
  const first = channels[0];
  if (first === undefined) return new Float32Array(0);
  const out = new Float32Array(first.length);
  if (channels.length === 1) {
    out.set(first);
    return out;
  }
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i] ?? 0;
    out[i] = sum / channels.length;
  }
  return out;
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

function blackman(x: number): number {
  // x in [-DELAY, DELAY]
  const u = (Math.PI * x) / DELAY;
  return 0.42 + 0.5 * Math.cos(u) + 0.08 * Math.cos(2 * u);
}

function sinc(x: number): number {
  return x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
}

export interface Resampler {
  /** Resample the next chunk of mono input; returns the output it completes. */
  process(input: ArrayLike<number>): Float32Array;
  readonly up: number;
  readonly down: number;
}

/**
 * After n input samples in total, exactly ceil(n·L/M) output samples have been emitted,
 * however the input is chunked (Property 1). Outputs are clipped to [−1, 1] (Property 2).
 */
export function createResampler(sourceRate: number): Resampler {
  if (!Number.isSafeInteger(sourceRate) || sourceRate < 1000 || sourceRate > 768000) {
    throw new RangeError("sourceRate must be an integer sample rate in [1000, 768000]");
  }
  const g = gcd(sourceRate, TARGET_RATE);
  const L = TARGET_RATE / g;
  const M = sourceRate / g;
  const cutoff = 0.46 * Math.min(1, L / M);

  function phaseTaps(phase: number): Float64Array {
    const taps = new Float64Array(TAPS);
    let sum = 0;
    for (let t = 0; t < TAPS; t++) {
      // Distance from the output's centre to input sample j = i0 − (TAPS − 1) + t.
      const x = phase / L + (DELAY - 1) - t;
      const value = Math.abs(x) <= DELAY ? 2 * cutoff * sinc(2 * cutoff * x) * blackman(x) : 0;
      taps[t] = value;
      sum += value;
    }
    for (let t = 0; t < TAPS; t++) taps[t] = (taps[t] ?? 0) / sum;
    return taps;
  }
  const table = L <= PRECOMPUTE_LIMIT ? Array.from({ length: L }, (_, p) => phaseTaps(p)) : null;

  // The last TAPS − 1 inputs (zeros before the stream starts).
  let history = new Float32Array(TAPS - 1);
  let consumed = 0; // inputs seen so far
  let i0 = 0; // floor(k·M/L) for the next output k
  let phase = 0; // (k·M) mod L

  return {
    up: L,
    down: M,
    process(input) {
      const total = consumed + input.length;
      const ext = new Float32Array(history.length + input.length);
      ext.set(history, 0);
      ext.set(input, history.length);
      // ext[0] is input index consumed − (TAPS − 1).
      const offset = consumed - (TAPS - 1);
      const count = Math.max(0, Math.ceil(((total - i0) * L - phase) / M));
      const out = new Float32Array(count);
      for (let n = 0; n < count; n++) {
        const taps = table?.[phase] ?? phaseTaps(phase);
        const start = i0 - (TAPS - 1) - offset;
        let acc = 0;
        for (let t = 0; t < TAPS; t++) acc += (taps[t] ?? 0) * (ext[start + t] ?? 0);
        out[n] = acc > 1 ? 1 : acc < -1 ? -1 : Number.isNaN(acc) ? 0 : acc;
        phase += M;
        i0 += Math.floor(phase / L);
        phase %= L;
      }
      history = ext.slice(ext.length - (TAPS - 1));
      consumed = total;
      return out;
    },
  };
}
