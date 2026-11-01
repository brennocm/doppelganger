import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createResampler, DELAY, downmix } from "./resampler.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;
const RATES = [22050, 44100, 48000, 96000] as const;

function sine(samples: number, hz: number, rate: number, amplitude = 0.5): Float32Array {
  return Float32Array.from(
    { length: samples },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate),
  );
}

function rms(x: Float32Array, from = 0): number {
  let s = 0;
  for (let i = from; i < x.length; i++) s += (x[i] ?? 0) ** 2;
  return Math.sqrt(s / (x.length - from));
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe("downmix", () => {
  it("averages channels", () => {
    expect(
      Array.from(
        downmix([
          [1, 0.5],
          [0, -0.5],
        ]),
      ),
    ).toEqual([0.5, 0]);
  });

  it("returns a copy of a single channel and empty output for no channels", () => {
    const mono = Float32Array.of(0.25, -0.75);
    const out = downmix([mono]);
    expect(out).not.toBe(mono);
    expect(Array.from(out)).toEqual([0.25, -0.75]);
    expect(downmix([])).toHaveLength(0);
  });

  // Feature: audio-capture, Property 3: Downmix preserves identical channels
  it("equals the channel when every channel is identical", () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { maxLength: 512 }),
        fc.integer({ min: 1, max: 8 }),
        (values, count) => {
          const channel = Float32Array.from(values);
          const out = downmix(Array.from({ length: count }, () => channel));
          expect(Array.from(out)).toEqual(Array.from(channel));
        },
      ),
      RUNS,
    );
  });
});

describe("createResampler", () => {
  it.each(RATES)("keeps DC and an in-band 1 kHz tone at %i Hz", (rate) => {
    const dc = createResampler(rate).process(new Float32Array(rate).fill(0.5));
    expect(dc.at(-1)).toBeCloseTo(0.5, 6);
    const tone = createResampler(rate).process(sine(rate, 1000, rate));
    expect(rms(tone, 200)).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  it("attenuates content above the 8 kHz Nyquist limit", () => {
    const out = createResampler(48000).process(sine(48000, 11000, 48000));
    expect(rms(out, 200)).toBeLessThan(0.01);
  });

  it("delays the signal by 16 input samples", () => {
    const impulse = new Float32Array(480);
    impulse[3 * 40] = 1; // input sample 120 = output position 40 at 48 kHz
    const out = createResampler(48000).process(impulse);
    let peak = 0;
    out.forEach((v, i) => {
      if (Math.abs(v) > Math.abs(out[peak] ?? 0)) peak = i;
    });
    // Output k is centred on input 3k − 16, so input 120 peaks at k = 136 / 3 ≈ 45.
    expect(peak).toBe(Math.round((120 + DELAY) / 3));
  });

  it("works for rates that need per-sample taps (L > 1024)", () => {
    const out = createResampler(44101).process(new Float32Array(44101).fill(0.25));
    expect(out).toHaveLength(16000);
    expect(out.at(-1)).toBeCloseTo(0.25, 5);
  });

  it.each([0, 999, 44100.5, Number.NaN])("rejects source rate %s", (rate) => {
    expect(() => createResampler(rate)).toThrow(RangeError);
  });

  // Feature: audio-capture, Property 1: Resampler output length
  it("emits round(n × 16000 / rate) ± 1 samples for any chunking", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RATES),
        fc.array(fc.integer({ min: 0, max: 3000 }), { maxLength: 20 }),
        (rate, sizes) => {
          const resampler = createResampler(rate);
          let n = 0;
          let emitted = 0;
          for (const size of sizes) {
            emitted += resampler.process(new Float32Array(size).fill(0.1)).length;
            n += size;
            expect(Math.abs(emitted - Math.round((n * 16000) / rate))).toBeLessThanOrEqual(1);
          }
        },
      ),
      RUNS,
    );
  });

  it("produces the same samples however the input is chunked", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RATES),
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { maxLength: 2000 }),
        fc.array(fc.integer({ min: 0, max: 2000 }), { maxLength: 8 }),
        (rate, values, cuts) => {
          const signal = Float32Array.from(values);
          const bounds = [
            0,
            ...cuts.map((c) => c % (signal.length + 1)).sort((a, b) => a - b),
            signal.length,
          ];
          const chunked = createResampler(rate);
          const parts = bounds
            .slice(1)
            .map((end, i) => chunked.process(signal.subarray(bounds[i], end)));
          expect(Array.from(concat(parts))).toEqual(
            Array.from(createResampler(rate).process(signal)),
          );
        },
      ),
      RUNS,
    );
  });

  // Feature: audio-capture, Property 2: Resampler output range
  it("keeps every output sample in [−1, 1]", () => {
    const edge = fc.constantFrom(-1, 1, 0, -0);
    fc.assert(
      fc.property(
        fc.constantFrom(...RATES),
        fc.array(fc.oneof(fc.float({ min: -1, max: 1, noNaN: true }), edge), { maxLength: 3000 }),
        (rate, values) => {
          // Alternating full-scale input is the worst case for sinc overshoot.
          for (const out of [
            createResampler(rate).process(values),
            createResampler(rate).process(values.map((_, i) => (i % 2 ? 1 : -1))),
          ]) {
            for (const v of out) {
              expect(v).toBeGreaterThanOrEqual(-1);
              expect(v).toBeLessThanOrEqual(1);
            }
          }
        },
      ),
      RUNS,
    );
  });
});
