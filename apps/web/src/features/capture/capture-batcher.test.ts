import { describe, expect, it } from "vitest";
import { CHUNK_SAMPLES, createCaptureBatcher } from "./capture-batcher.ts";

const QUANTUM = 128;

describe("createCaptureBatcher", () => {
  it("turns 48 kHz stereo quanta into 100 ms mono chunks of 1,600 samples", () => {
    const batcher = createCaptureBatcher(48000);
    const left = new Float32Array(QUANTUM).fill(0.5);
    const right = new Float32Array(QUANTUM).fill(0.5);
    const chunks: Float32Array[] = [];
    // One second of render quanta: 375 × 128 = 48,000 frames.
    for (let i = 0; i < 375; i++) chunks.push(...batcher.push([left, right]));
    expect(chunks).toHaveLength(10);
    for (const c of chunks) expect(c).toHaveLength(CHUNK_SAMPLES);
    expect(batcher.buffered()).toBe(0);
    expect(chunks.at(-1)?.at(-1)).toBeCloseTo(0.5, 6);
  });

  it("keeps fewer than one chunk between calls and hands out fresh buffers", () => {
    const batcher = createCaptureBatcher(44100);
    const quantum = new Float32Array(QUANTUM).fill(0.1);
    const seen = new Set<ArrayBufferLike>();
    for (let i = 0; i < 2000; i++) {
      for (const c of batcher.push([quantum])) {
        expect(seen.has(c.buffer)).toBe(false);
        seen.add(c.buffer);
      }
      expect(batcher.buffered()).toBeLessThan(CHUNK_SAMPLES);
    }
  });

  it("ignores a quantum with no channels", () => {
    expect(createCaptureBatcher(48000).push([])).toEqual([]);
  });
});
