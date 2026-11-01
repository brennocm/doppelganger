/**
 * Golden vectors for the local engine (local-runtime design, P29): PCM16 encoding, and the
 * per-window output of createDetector on a PCM16 signal with a fake single-logit model
 * (logit = 40 × window mean). The engine's Python tests assert against both files.
 * `vitest run -u` rewrites them.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDetector } from "./detector.ts";
import { DEFAULT_CONFIG } from "./haunting-machine.ts";
import { decodePcm16, encodePcm16, pcm16Bytes } from "./pcm16.ts";
import { RUNS } from "./property-runs.ts";
import { seededUniform, sine, voicedSpeech } from "./synthetic-signals.ts";
import { fakeBackend, flush, testManifest } from "./test-doubles.ts";

const PCM_INPUTS = [
  0,
  -0,
  1,
  -1,
  0.5,
  -0.5,
  1.5,
  -1.5,
  1 / 32768,
  -1 / 32768,
  0.999969482421875,
  0.123456789,
  -0.987654321,
  Number.NaN,
];

/** Window mean in float64, summed in index order (the engine sums the same way). */
function mean(w: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < w.length; i++) sum += w[i] ?? 0;
  return w.length > 0 ? sum / w.length : 0;
}

function streamSignal(): Int16Array {
  const parts = [
    new Float32Array(2400),
    voicedSpeech(4000),
    sine(3200, 3500, 0.4),
    new Float32Array(1600),
    voicedSpeech(4800, 0.6).map((v) => v + 0.05),
    Float32Array.from({ length: 2400 }, seededUniform(7)).map((v) => v * 0.3),
  ];
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return encodePcm16(all);
}

describe("PCM16", () => {
  // Feature: local-runtime, Property 4: PCM16 round trip
  it("changes no sample in [−1, 1] by more than 1/32768", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(fc.float({ min: -1, max: 1, noNaN: true }), fc.constantFrom(-1, 1, 0, -0)),
          { maxLength: 500 },
        ),
        (values) => {
          const back = decodePcm16(encodePcm16(values));
          values.forEach((v, i) => {
            expect(Math.abs((back[i] ?? 0) - v)).toBeLessThanOrEqual(1 / 32768);
          });
        },
      ),
      RUNS,
    );
  });

  it("writes little-endian bytes", () => {
    expect(Array.from(pcm16Bytes([0.5, -1]))).toEqual([0x00, 0x40, 0x00, 0x80]);
  });

  it("matches the committed PCM16 golden vectors", async () => {
    const encoded = Array.from(encodePcm16(PCM_INPUTS));
    const cases = PCM_INPUTS.map((x, i) => ({
      input: Number.isNaN(x) ? "NaN" : x,
      pcm: encoded[i],
      decoded: (encoded[i] ?? 0) / 32768,
    }));
    const text = `{\n  "description": "PCM16 encode round(clamp(x) * 32768) clamped to int16, NaN as 0; decode n / 32768",\n  "cases": [\n${cases.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ]\n}\n`;
    await expect(text).toMatchFileSnapshot("../../contracts/fixtures/golden/pcm16.json");
  });
});

it("matches the committed stream golden vectors", async () => {
  const manifest = testManifest({ windowSamples: 1600, hopSamples: 800 });
  const pcm = streamSignal();
  const detector = createDetector({
    manifest,
    backend: fakeBackend((w) => [40 * mean(w)]),
    config: DEFAULT_CONFIG,
    clock: () => 0,
  });
  const rows: {
    windowIndex: number;
    voiced: boolean;
    raw: number | null;
    smoothed: number | null;
    state: string;
  }[] = [];
  detector.subscribe((u) => {
    if (u.windowIndex !== null)
      rows.push({
        windowIndex: u.windowIndex,
        voiced: u.raw !== null,
        raw: u.raw,
        smoothed: u.raw === null ? null : u.smoothed,
        state: u.state,
      });
  });
  detector.start();
  const samples = decodePcm16(pcm);
  for (let i = 0; i < samples.length; i += 800) {
    detector.push(samples.subarray(i, i + 800));
    await flush(8);
  }
  const text = `{\n  "description": "createDetector on this PCM16 signal (16 kHz) with window 1600, hop 800, DEFAULT_CONFIG and a fake single-logit model: logit = float32(40 * mean(window)), temperature 1",\n  "windowSamples": 1600,\n  "hopSamples": 800,\n  "pcm": ${JSON.stringify(Array.from(pcm))},\n  "windows": [\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]\n}\n`;
  await expect(text).toMatchFileSnapshot("../../contracts/fixtures/golden/stream.json");
});
