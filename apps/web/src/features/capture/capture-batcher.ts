/**
 * Worklet logic without Web Audio types: downmix, resample to 16 kHz and cut into
 * 100 ms chunks (audio-capture Requirement 3). It keeps fewer than CHUNK_SAMPLES
 * samples between calls; full chunks are handed over and not kept (Requirement 3.4).
 */
import { createResampler, downmix, type Resampler } from "./resampler.ts";

export const CHUNK_SAMPLES = 1600;

export interface CaptureBatcher {
  /** Feed one render quantum (one array per channel); returns completed chunks. */
  push(channels: readonly ArrayLike<number>[]): Float32Array[];
  /** Samples waiting for the next chunk. */
  buffered(): number;
}

export function createCaptureBatcher(sourceRate: number): CaptureBatcher {
  const resampler: Resampler = createResampler(sourceRate);
  let pending = new Float32Array(CHUNK_SAMPLES);
  let filled = 0;
  return {
    push(channels) {
      if (channels.length === 0) return [];
      const mono = resampler.process(downmix(channels));
      const chunks: Float32Array[] = [];
      let at = 0;
      while (at < mono.length) {
        const take = Math.min(CHUNK_SAMPLES - filled, mono.length - at);
        pending.set(mono.subarray(at, at + take), filled);
        filled += take;
        at += take;
        if (filled === CHUNK_SAMPLES) {
          chunks.push(pending);
          pending = new Float32Array(CHUNK_SAMPLES);
          filled = 0;
        }
      }
      return chunks;
    },
    buffered() {
      return filled;
    },
  };
}
