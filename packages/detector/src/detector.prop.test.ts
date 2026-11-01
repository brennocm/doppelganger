import fc from "fast-check";
import { describe, expect, it } from "vitest";
import sessionStatsSchema from "../../contracts/schemas/session-stats.schema.json" with {
  type: "json",
};
import { createDetector } from "./detector.ts";
import { DEFAULT_CONFIG } from "./haunting-machine.ts";
import { RUNS } from "./property-runs.ts";
import { fakeBackend, flush, logit, testManifest } from "./test-doubles.ts";

const STATS_KEYS = Object.keys(sessionStatsSchema.properties).sort();

describe("Detector properties", () => {
  // Feature: detection-core, Property 12: Statistics never contain audio
  it("serializes only schema fields, sized by transitions and not by samples", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.double({ min: 0.01, max: 0.99, noNaN: true }), { maxLength: 30 }),
        fc.integer({ min: 1, max: 40 }),
        async (probabilities, repeat) => {
          // Every score is repeated `repeat` times: more samples, no new kinds of events.
          const outputs = probabilities.flatMap((p) => Array<number>(repeat).fill(p));
          const windows = outputs.length;
          const detector = createDetector({
            manifest: testManifest(),
            backend: fakeBackend(() => [logit(outputs.shift() ?? 0.5)]),
            config: DEFAULT_CONFIG,
            clock: () => 0,
          });
          detector.start();
          for (let i = 0; i < windows; i++) {
            detector.push([0.5, -0.25, 0.5, 0.25]);
            await flush(4);
          }
          const stats = detector.stats();
          expect(Object.keys(stats).sort()).toEqual(STATS_KEYS);
          const json = JSON.stringify(stats);
          // Fixed part plus one bounded record per transition; no arrays of samples.
          expect(json.length).toBeLessThanOrEqual(600 + 80 * stats.transitions.length);
          for (const value of Object.values(stats)) {
            if (Array.isArray(value)) expect(value).toBe(stats.transitions);
          }
          expect(json).not.toContain("-0.25");
        },
      ),
      RUNS,
    );
  });

  // Feature: detection-core, Property 13: Bounded queue
  it("never has more than maxPending windows waiting and processes them in order", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.oneof(fc.constant("push" as const), fc.constant("settle" as const)), {
          maxLength: 60,
        }),
        async (maxPending, steps) => {
          const backend = fakeBackend(() => [logit(0.3)], { manual: true });
          const detector = createDetector({
            manifest: testManifest(),
            backend,
            config: { ...DEFAULT_CONFIG, maxPending },
            clock: () => 0,
          });
          detector.start();
          let pushed = 0;
          for (const step of steps) {
            if (step === "push") {
              pushed += 1;
              const v = 0.25 + pushed / 1024; // above the VAD energy floor
              detector.push([v, v, v, v]);
            } else {
              backend.settle();
            }
            await flush(6);
            expect(detector.pendingWindows()).toBeLessThanOrEqual(maxPending);
            expect(backend.inFlight).toBeLessThanOrEqual(1);
          }
          while (backend.settle()) await flush(6);
          const order = backend.seen;
          for (let i = 1; i < order.length; i++) {
            expect(order[i]).toBeGreaterThan(order[i - 1] ?? Number.POSITIVE_INFINITY);
          }
          expect(order.length + detector.stats().droppedWindows).toBe(pushed);
        },
      ),
      RUNS,
    );
  });
});
