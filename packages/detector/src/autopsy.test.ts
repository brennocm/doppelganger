import { type AutopsyWindow, parseAutopsyReport } from "@doppelganger/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createAutopsyRunner, deriveVerdict, MIN_SCORED_WINDOWS } from "./autopsy.ts";
import { createDetector } from "./detector.ts";
import {
  DEFAULT_CONFIG,
  INITIAL_STATE,
  type MachineState,
  transition,
} from "./haunting-machine.ts";
import { RUNS } from "./property-runs.ts";
import { fakeBackend, flush, logit, testManifest } from "./test-doubles.ts";

const noYield = () => Promise.resolve();

/** A window list from (voiced, smoothed) pairs, one second apart. */
function windowsOf(values: readonly (number | null)[]): AutopsyWindow[] {
  return values.map((v, i) => ({
    index: i,
    startS: i,
    endS: i + 4,
    voiced: v !== null,
    score: v,
    smoothed: v,
  }));
}

describe("deriveVerdict", () => {
  it("needs at least three scored windows", () => {
    expect(deriveVerdict(windowsOf([0.99, 0.99]), DEFAULT_CONFIG).verdictReason).toBe(
      "Not enough speech",
    );
    expect(deriveVerdict(windowsOf([null, null, null, null]), DEFAULT_CONFIG).verdict).toBe(
      "inconclusive",
    );
  });

  it("follows the machine: Possession, Unease, or low", () => {
    expect(deriveVerdict(windowsOf([0.9, 0.9, 0.9]), DEFAULT_CONFIG).verdict).toBe(
      "likely-synthetic",
    );
    expect(deriveVerdict(windowsOf([0.5, 0.5, 0.5]), DEFAULT_CONFIG).verdict).toBe("inconclusive");
    expect(deriveVerdict(windowsOf([0.1, 0.1, 0.1]), DEFAULT_CONFIG)).toMatchObject({
      verdict: "likely-human",
      verdictReason: "Dissonance stayed low",
    });
  });

  it("merges consecutive windows in the same state into segments", () => {
    const { states } = deriveVerdict(windowsOf([0.1, 0.1, 0.5, 0.5]), DEFAULT_CONFIG);
    expect(states).toEqual([
      { from: 0, to: 5, state: "mask" },
      { from: 2, to: 7, state: "unease" },
    ]);
  });

  // Feature: autopsy-mode, Property 1: Verdict consistency with the state machine
  it("is likely-synthetic iff the replayed machine reaches Possession", () => {
    const value = fc.oneof(
      fc.constant(null),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.constantFrom(DEFAULT_CONFIG.unease, DEFAULT_CONFIG.possession, DEFAULT_CONFIG.release),
    );
    fc.assert(
      fc.property(fc.array(value, { maxLength: 60 }), (values) => {
        const windows = windowsOf(values);
        let s: MachineState = transition(
          INITIAL_STATE,
          { type: "capture-started", at: 0 },
          DEFAULT_CONFIG,
        );
        const seen = new Set<string>();
        for (const w of windows) {
          s = transition(
            s,
            w.smoothed === null
              ? { type: "silence", at: w.startS * 1000 }
              : { type: "window-scored", at: w.startS * 1000, smoothed: w.smoothed },
            DEFAULT_CONFIG,
          );
          seen.add(s.state);
        }
        const scored = values.filter((v) => v !== null).length;
        const { verdict } = deriveVerdict(windows, DEFAULT_CONFIG);
        if (scored < MIN_SCORED_WINDOWS) expect(verdict).toBe("inconclusive");
        else if (seen.has("possession")) expect(verdict).toBe("likely-synthetic");
        else if (seen.has("unease")) expect(verdict).toBe("inconclusive");
        else expect(verdict).toBe("likely-human");
      }),
      RUNS,
    );
  });
});

describe("createAutopsyRunner", () => {
  const manifest = testManifest();

  it("reports progress, and cancels between windows without a report", async () => {
    const runner = createAutopsyRunner({
      manifest,
      backend: fakeBackend(() => [0]),
      config: DEFAULT_CONFIG,
      yieldNow: noYield,
    });
    const progress: number[] = [];
    const signal = new Float32Array(4 * 25).fill(0.5);
    const done = await runner.run(signal, { onProgress: (n) => progress.push(n) });
    expect(progress).toEqual([10, 20, 25]);
    expect(done.cancelled).toBe(false);
    let calls = 0;
    const cancelled = await runner.run(signal, { isCancelled: () => ++calls > 5 });
    expect(cancelled).toEqual({ cancelled: true });
  });

  // Feature: autopsy-mode, Property 2: Batch equals streaming
  it("scores every window exactly as live streaming does", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.oneof(fc.constant(0), fc.double({ min: -1, max: 1, noNaN: true })), {
          maxLength: 120,
        }),
        fc.array(fc.double({ min: 0.01, max: 0.99, noNaN: true }), { minLength: 1, maxLength: 8 }),
        async (values, probabilities) => {
          const signal = Float32Array.from(values);
          // The output depends only on the window's content, so both paths see the same scores.
          const respond = (w: Float32Array) => [
            logit(
              probabilities[Math.abs(Math.round((w[0] ?? 0) * 7)) % probabilities.length] ?? 0.5,
            ),
          ];
          const batch = await createAutopsyRunner({
            manifest,
            backend: fakeBackend(respond),
            config: DEFAULT_CONFIG,
            yieldNow: noYield,
          }).run(signal);
          const detector = createDetector({
            manifest,
            backend: fakeBackend(respond),
            config: DEFAULT_CONFIG,
            clock: () => 0,
          });
          const live = new Map<number, number | null>();
          detector.subscribe((u) => {
            if (u.windowIndex !== null) live.set(u.windowIndex, u.raw);
          });
          detector.start();
          // Real-time chunks: one hop at a time, letting each window finish (no drops).
          for (let i = 0; i < signal.length; i += manifest.hopSamples) {
            detector.push(signal.subarray(i, i + manifest.hopSamples));
            await flush(8);
          }
          expect(batch.cancelled).toBe(false);
          if (batch.cancelled) return;
          expect(batch.report.windows.map((w) => w.score)).toEqual(
            batch.report.windows.map((w) => live.get(w.index) ?? null),
          );
          expect(batch.report.windows).toHaveLength(live.size);
        },
      ),
      RUNS,
    );
  });

  // Feature: autopsy-mode, Property 3: Report has no audio
  it("produces schema-valid JSON whose size grows only with the number of windows", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 60 }),
        fc.double({ min: -1, max: 1, noNaN: true }),
        async (count, level) => {
          const runner = createAutopsyRunner({
            manifest,
            backend: fakeBackend(() => [0.3]),
            config: DEFAULT_CONFIG,
            yieldNow: noYield,
          });
          const outcome = await runner.run(
            new Float32Array(count * manifest.hopSamples).fill(level),
          );
          expect(outcome.cancelled).toBe(false);
          if (outcome.cancelled) return;
          const json = JSON.stringify(outcome.report);
          expect(parseAutopsyReport(JSON.parse(json)).ok).toBe(true);
          // Fixed part plus a bounded record per window and per segment.
          expect(json.length).toBeLessThanOrEqual(
            400 + 140 * outcome.report.windows.length + 80 * outcome.report.states.length,
          );
          expect(outcome.report.states.length).toBeLessThanOrEqual(
            Math.max(1, outcome.report.windows.length),
          );
        },
      ),
      RUNS,
    );
  });
});
