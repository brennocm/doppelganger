/** Windower: slices a 16 kHz sample stream into model-sized windows (Requirement 1). */

export interface WindowerConfig {
  windowSamples: number;
  hopSamples: number;
}

export interface AudioWindow {
  index: number;
  startSample: number;
  samples: Float32Array;
}

export interface Windower {
  /** Append samples; returns every window completed by them, in order. */
  push(chunk: ArrayLike<number>): AudioWindow[];
  /** Discard all buffered samples and start counting from zero again. */
  reset(): void;
  /** Number of samples currently held (Property 3). */
  buffered(): number;
}

export class ConfigError extends Error {
  readonly key: string;
  constructor(key: string, message: string) {
    super(`${key}: ${message}`);
    this.name = "ConfigError";
    this.key = key;
  }
}

function positiveInteger(key: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConfigError(key, "must be a positive integer");
  }
}

/**
 * Window i is the slice [i * hop, i * hop + window) of the concatenated stream, however
 * the stream is chunked. Between pushes it holds fewer than `windowSamples` samples, so
 * during a push it never holds more than `windowSamples + chunk.length`.
 */
export function createWindower(cfg: WindowerConfig): Windower {
  positiveInteger("windowSamples", cfg.windowSamples);
  positiveInteger("hopSamples", cfg.hopSamples);
  const { windowSamples: w, hopSamples: h } = cfg;
  let buffer = new Float32Array(0);
  // Stream position of buffer[0], and of the next window's first sample.
  let bufferStart = 0;
  let nextIndex = 0;

  return {
    push(chunk) {
      const merged = new Float32Array(buffer.length + chunk.length);
      merged.set(buffer, 0);
      merged.set(chunk, buffer.length);
      buffer = merged;
      const windows: AudioWindow[] = [];
      for (;;) {
        const start = nextIndex * h;
        const offset = start - bufferStart;
        if (offset + w > buffer.length) break;
        windows.push({
          index: nextIndex,
          startSample: start,
          samples: buffer.slice(offset, offset + w),
        });
        nextIndex += 1;
      }
      // Drop everything before the next window's start (it may lie beyond the buffer when
      // hop > window; then the samples in between are skipped as they arrive).
      const keepFrom = Math.min(nextIndex * h - bufferStart, buffer.length);
      buffer = buffer.slice(keepFrom);
      bufferStart += keepFrom;
      return windows;
    },
    reset() {
      buffer = new Float32Array(0);
      bufferStart = 0;
      nextIndex = 0;
    },
    buffered() {
      return buffer.length;
    },
  };
}
