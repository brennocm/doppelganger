import type { DetectorConfig } from "@doppelganger/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDetector } from "./detector.ts";
import {
  DEFAULT_CONFIG,
  type HauntingConfig,
  type HauntingEvent,
  INITIAL_STATE,
  type MachineState,
  transition,
} from "./haunting-machine.ts";
import { RUNS } from "./property-runs.ts";
import { fakeBackend, testManifest } from "./test-doubles.ts";
import { ConfigError } from "./windower.ts";

/** Valid configurations, including thresholds that touch each other. */
const config: fc.Arbitrary<HauntingConfig> = fc
  .record({
    a: fc.double({ min: 0, max: 1, noNaN: true }),
    b: fc.double({ min: 0, max: 1, noNaN: true }),
    c: fc.double({ min: 0, max: 1, noNaN: true }),
    confirmWindows: fc.integer({ min: 1, max: 5 }),
    releaseWindows: fc.integer({ min: 1, max: 6 }),
    silenceMs: fc.integer({ min: 0, max: 4000 }),
  })
  .filter(({ a, b }) => a !== b)
  .map(({ a, b, c, ...rest }) => {
    const possession = Math.max(a, b);
    const release = Math.min(a, b);
    return { ...rest, possession, release, unease: Math.min(c, possession) };
  });

/** Smoothed values, with the threshold values themselves drawn often. */
const smoothedFor = (cfg: HauntingConfig) =>
  fc.oneof(
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.constantFrom(0, 1, cfg.unease, cfg.possession, cfg.release),
  );

type Step = { kind: HauntingEvent["type"]; smoothed: number; dt: number };
const stepsFor = (cfg: HauntingConfig, maxLength = 80) =>
  fc.array(
    fc.record({
      kind: fc.oneof(
        { weight: 8, arbitrary: fc.constant("window-scored" as const) },
        { weight: 2, arbitrary: fc.constant("silence" as const) },
        { weight: 1, arbitrary: fc.constant("protocol-completed" as const) },
        { weight: 1, arbitrary: fc.constant("capture-started" as const) },
        { weight: 1, arbitrary: fc.constant("capture-stopped" as const) },
      ),
      smoothed: smoothedFor(cfg),
      dt: fc.integer({ min: 0, max: 3000 }),
    }),
    { maxLength },
  );

function toEvents(steps: Step[]): HauntingEvent[] {
  let at = 0;
  const events: HauntingEvent[] = [{ type: "capture-started", at }];
  for (const s of steps) {
    at += s.dt;
    events.push(
      s.kind === "window-scored"
        ? { type: s.kind, at, smoothed: s.smoothed }
        : ({ type: s.kind, at } as HauntingEvent),
    );
  }
  return events;
}

function run(events: HauntingEvent[], cfg: HauntingConfig, from = INITIAL_STATE): MachineState[] {
  const states: MachineState[] = [];
  let s: MachineState = from;
  for (const e of events) {
    s = transition(s, e, cfg);
    states.push(s);
  }
  return states;
}

const withSteps = (maxLength?: number) =>
  config.chain((cfg) => fc.tuple(fc.constant(cfg), stepsFor(cfg, maxLength)));

describe("Haunting_Machine properties", () => {
  // Feature: detection-core, Property 6: No possession without confirmation
  it("enters Possession only after confirmWindows scored windows at or above possession", () => {
    fc.assert(
      fc.property(withSteps(), ([cfg, steps]) => {
        const events = toEvents(steps);
        const states = run(events, cfg);
        states.forEach((s, k) => {
          const before = k === 0 ? INITIAL_STATE.state : states[k - 1]?.state;
          if (s.state !== "possession" || before === "possession") return;
          // The confirmWindows most recent window-scored events up to k, within this capture.
          const recent: number[] = [];
          for (let j = k; j >= 0 && recent.length < cfg.confirmWindows; j--) {
            const e = events[j];
            if (e?.type === "capture-stopped") break;
            if (e?.type === "window-scored") recent.push(e.smoothed);
          }
          expect(recent).toHaveLength(cfg.confirmWindows);
          for (const v of recent) expect(v).toBeGreaterThanOrEqual(cfg.possession);
        });
      }),
      RUNS,
    );
  });

  // Feature: detection-core, Property 7: Possession is sticky
  it("leaves Possession only by protocol, stop, or releaseWindows windows below release", () => {
    fc.assert(
      fc.property(withSteps(), ([cfg, steps]) => {
        const events = toEvents(steps);
        const states = run(events, cfg);
        let below = 0;
        states.forEach((s, k) => {
          const e = events[k];
          const before = k === 0 ? INITIAL_STATE.state : states[k - 1]?.state;
          if (before !== "possession") {
            below = 0;
            return;
          }
          if (e?.type === "window-scored") below = e.smoothed < cfg.release ? below + 1 : 0;
          if (s.state === "possession") return;
          const allowed =
            e?.type === "protocol-completed" ||
            e?.type === "capture-stopped" ||
            (e?.type === "window-scored" && below >= cfg.releaseWindows);
          expect(allowed).toBe(true);
        });
      }),
      RUNS,
    );
  });

  // Feature: detection-core, Property 8: No flicker inside the hysteresis band
  it("never crosses Possession while every score stays in [release, possession)", () => {
    fc.assert(
      fc.property(
        config.chain((cfg) =>
          fc.tuple(
            fc.constant(cfg),
            fc.array(
              fc.oneof(
                fc.double({ min: cfg.release, max: cfg.possession, noNaN: true }),
                fc.constant(cfg.release),
              ),
              { maxLength: 100 },
            ),
            fc.constantFrom<MachineState["state"]>(
              "possession",
              "listening",
              "mask",
              "unease",
              "exorcised",
            ),
          ),
        ),
        ([cfg, values, start]) => {
          const inBand = values.filter((v) => v >= cfg.release && v < cfg.possession);
          const events = inBand.map(
            (v, i): HauntingEvent => ({ type: "window-scored", at: i, smoothed: v }),
          );
          const states = run(events, cfg, { ...INITIAL_STATE, state: start });
          for (const s of states) {
            if (start === "possession") expect(s.state).toBe("possession");
            else expect(s.state).not.toBe("possession");
          }
        },
      ),
      RUNS,
    );
  });

  // Feature: detection-core, Property 9: Exorcised requires Possession and is sticky
  it("enters Exorcised only from Possession and leaves it only for Possession or Idle", () => {
    fc.assert(
      fc.property(withSteps(), ([cfg, steps]) => {
        const events = toEvents(steps);
        const states = run(events, cfg);
        states.forEach((s, k) => {
          const before = k === 0 ? INITIAL_STATE.state : states[k - 1]?.state;
          if (s.state === "exorcised" && before !== "exorcised") {
            expect(before).toBe("possession");
            expect(events[k]?.type).toBe("protocol-completed");
          }
          if (before === "exorcised" && s.state !== "exorcised") {
            expect(["possession", "idle"]).toContain(s.state);
            if (s.state === "possession") {
              // Re-possession needs confirmWindows scored windows at or above possession.
              const e = events[k];
              expect(e?.type === "window-scored" && e.smoothed >= cfg.possession).toBe(true);
              expect(states[k]?.aboveCount).toBeGreaterThanOrEqual(cfg.confirmWindows);
            }
          }
        });
      }),
      RUNS,
    );
  });

  // Feature: detection-core, Property 10: Stop resets
  it("is Idle with zero counters after capture-stopped", () => {
    fc.assert(
      fc.property(withSteps(), ([cfg, steps]) => {
        const events = [...toEvents(steps), { type: "capture-stopped", at: 1e9 } as const];
        expect(run(events, cfg).at(-1)).toEqual(INITIAL_STATE);
      }),
      RUNS,
    );
  });

  // Feature: detection-core, Property 11: Invalid configurations rejected
  it("throws a configuration error when release ≥ possession or unease > possession", () => {
    const bad = fc
      .record({
        unease: fc.double({ min: 0, max: 1, noNaN: true }),
        possession: fc.double({ min: 0, max: 1, noNaN: true }),
        release: fc.double({ min: 0, max: 1, noNaN: true }),
      })
      .filter((t) => t.release >= t.possession || t.unease > t.possession);
    fc.assert(
      fc.property(bad, (thresholds) => {
        const config: DetectorConfig = { ...DEFAULT_CONFIG, ...thresholds };
        const create = () =>
          createDetector({
            manifest: testManifest(),
            backend: fakeBackend(),
            config,
            clock: () => 0,
          });
        expect(create).toThrow(ConfigError);
      }),
      RUNS,
    );
  });
});
