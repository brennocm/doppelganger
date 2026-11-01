import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RUNS } from "./property-runs.ts";
import { createWindower } from "./windower.ts";

const sample = fc.float({ min: -1, max: 1, noNaN: true });
const chunk = fc.array(sample, { maxLength: 40 });
const chunks = fc.array(chunk, { maxLength: 30 });
const size = fc.integer({ min: 1, max: 24 });

describe("Windower properties", () => {
  // Feature: detection-core, Property 1: Window count
  it("emits max(0, floor((N - W) / H) + 1) windows", () => {
    fc.assert(
      fc.property(chunks, size, size, (parts, w, h) => {
        const windower = createWindower({ windowSamples: w, hopSamples: h });
        const count = parts.reduce((n, part) => n + windower.push(part).length, 0);
        const total = parts.reduce((n, part) => n + part.length, 0);
        expect(count).toBe(Math.max(0, Math.floor((total - w) / h) + 1));
      }),
      RUNS,
    );
  });

  // Feature: detection-core, Property 2: Chunking invariance
  it("emits the same windows for any chunking, each equal to its slice", () => {
    fc.assert(
      fc.property(
        fc.array(sample, { maxLength: 200 }),
        fc.array(fc.integer({ min: 0, max: 200 }), { maxLength: 12 }),
        size,
        size,
        (signal, cuts, w, h) => {
          const bounds = [0, ...cuts.map((c) => c % (signal.length + 1)).sort((a, b) => a - b)];
          const parts = bounds.map((b, i) => signal.slice(b, bounds[i + 1] ?? signal.length));
          const chunked = createWindower({ windowSamples: w, hopSamples: h });
          const whole = createWindower({ windowSamples: w, hopSamples: h });
          const a = parts.flatMap((part) => chunked.push(part));
          const b = whole.push(signal);
          expect(a.length).toBe(b.length);
          a.forEach((win, i) => {
            expect(win.index).toBe(i);
            expect(win.startSample).toBe(i * h);
            expect(Array.from(win.samples)).toEqual(Array.from(b[i]?.samples ?? []));
            const expected = Float32Array.from(signal.slice(i * h, i * h + w));
            expect(Array.from(win.samples)).toEqual(Array.from(expected));
          });
        },
      ),
      RUNS,
    );
  });

  // Feature: detection-core, Property 3: Bounded memory
  it("never holds more than W + maxChunk samples", () => {
    fc.assert(
      fc.property(chunks, size, size, (parts, w, h) => {
        const windower = createWindower({ windowSamples: w, hopSamples: h });
        const maxChunk = Math.max(0, ...parts.map((p) => p.length));
        for (const part of parts) {
          windower.push(part);
          expect(windower.buffered()).toBeLessThanOrEqual(w + maxChunk);
          // Between pushes, less than one window is kept.
          expect(windower.buffered()).toBeLessThan(w);
        }
      }),
      RUNS,
    );
  });
});
