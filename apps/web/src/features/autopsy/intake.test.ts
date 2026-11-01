import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { type DecodedAudio, intake, MAX_BYTES, MAX_SECONDS, supportedFormats } from "./intake.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;

function decoded(seconds: number, rate = 48000, channels = 2): DecodedAudio {
  const data = new Float32Array(Math.round(seconds * rate)).fill(0.25);
  return {
    sampleRate: rate,
    duration: seconds,
    numberOfChannels: channels,
    getChannelData: () => data,
  };
}

const file = (size: number) => ({ size, arrayBuffer: vi.fn(async () => new ArrayBuffer(8)) });

describe("intake", () => {
  it("decodes, downmixes and resamples to 16 kHz mono", async () => {
    const result = await intake(file(1000), async () => decoded(2));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.samples.length).toBe(32000);
      expect(result.durationS).toBe(2);
    }
  });

  it("rejects recordings longer than 5 minutes after decoding", async () => {
    expect(await intake(file(1000), async () => decoded(MAX_SECONDS + 0.5, 8000, 1))).toEqual({
      ok: false,
      error: "too-long",
    });
  });

  it("reports a decode failure", async () => {
    expect(await intake(file(1000), () => Promise.reject(new Error("bad")))).toEqual({
      ok: false,
      error: "decode-failed",
    });
  });

  it("lists the formats the browser can play", () => {
    expect(
      supportedFormats((t) => (t.includes("wav") || t.includes("mpeg") ? "maybe" : "")),
    ).toEqual(["WAV", "MP3"]);
  });

  // Feature: autopsy-mode, Property 4: Limits enforced before decoding
  it("rejects any file over 20 MB without reading or decoding it", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ min: MAX_BYTES + 1, max: 2 ** 40 }),
          fc.constantFrom(MAX_BYTES + 1, Number.POSITIVE_INFINITY, Number.NaN),
        ),
        async (size) => {
          const f = file(size);
          const decode = vi.fn(async () => decoded(1));
          expect(await intake(f, decode)).toEqual({ ok: false, error: "too-large" });
          expect(f.arrayBuffer).not.toHaveBeenCalled();
          expect(decode).not.toHaveBeenCalled();
        },
      ),
      RUNS,
    );
    // Exactly at the limit is accepted.
    expect((await intake(file(MAX_BYTES), async () => decoded(1))).ok).toBe(true);
  });
});
