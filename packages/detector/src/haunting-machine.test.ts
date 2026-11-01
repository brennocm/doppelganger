import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  type HauntingEvent,
  INITIAL_STATE,
  type MachineState,
  resolveConfig,
  transition,
  validateConfig,
} from "./haunting-machine.ts";
import { ConfigError } from "./windower.ts";

const cfg = DEFAULT_CONFIG;
const at = (s: MachineState, ...events: HauntingEvent[]) =>
  events.reduce((state, e) => transition(state, e, cfg), s);
const scoredAt = (t: number, smoothed: number): HauntingEvent => ({
  type: "window-scored",
  at: t,
  smoothed,
});
const scores = (from: number, ...values: number[]) =>
  values.map((v, i) => scoredAt(from + i * 1000, v));
const listening = at(INITIAL_STATE, { type: "capture-started", at: 0 });
const possessed = at(listening, ...scores(1000, 0.9, 0.9, 0.9));

describe("transition (Requirement 5)", () => {
  it("5.1: capture-started moves Idle to Listening", () => {
    expect(listening).toEqual({ ...INITIAL_STATE, state: "listening" });
  });

  it("ignores capture-started outside Idle and every other event in Idle", () => {
    expect(at(possessed, { type: "capture-started", at: 9000 })).toBe(possessed);
    expect(at(INITIAL_STATE, scoredAt(1, 0.9), { type: "silence", at: 2 })).toBe(INITIAL_STATE);
    expect(at(INITIAL_STATE, { type: "protocol-completed", at: 3 })).toBe(INITIAL_STATE);
  });

  it("5.2: a voiced window below unease shows Mask", () => {
    expect(at(listening, scoredAt(1000, 0.39)).state).toBe("mask");
  });

  it("5.3: unease ≤ smoothed < possession shows Unease, including exactly unease", () => {
    expect(at(listening, scoredAt(1000, 0.4)).state).toBe("unease");
    expect(at(listening, scoredAt(1000, 0.69)).state).toBe("unease");
  });

  it("5.4: Possession needs confirmWindows consecutive windows at or above possession", () => {
    const two = at(listening, ...scores(1000, 0.7, 0.7));
    expect(two.state).toBe("unease");
    expect(at(two, scoredAt(3000, 0.7)).state).toBe("possession");
    const broken = at(listening, ...scores(1000, 0.9, 0.9, 0.69, 0.9, 0.9));
    expect(broken.state).toBe("unease");
  });

  it("5.5: Possession holds until releaseWindows windows below release", () => {
    const four = at(possessed, ...scores(4000, 0.1, 0.1, 0.1, 0.1));
    expect(four.state).toBe("possession");
    expect(at(four, scoredAt(8000, 0.1)).state).toBe("mask");
    const inBand = at(possessed, ...scores(4000, 0.1, 0.1, 0.1, 0.1, 0.5));
    expect(inBand.state).toBe("possession");
    expect(at(possessed, ...scores(4000, 0.45, 0.45, 0.45, 0.45, 0.45)).state).toBe("unease");
  });

  it("5.6: protocol-completed in Possession enters Exorcised and resets counters", () => {
    const exorcised = at(possessed, { type: "protocol-completed", at: 4000 });
    expect(exorcised).toMatchObject({ state: "exorcised", aboveCount: 0, belowCount: 0 });
    expect(at(listening, { type: "protocol-completed", at: 4000 }).state).toBe("listening");
  });

  it("5.7: Exorcised re-enters Possession only after a fresh confirmation", () => {
    const exorcised = at(possessed, { type: "protocol-completed", at: 4000 });
    const two = at(exorcised, ...scores(5000, 0.9, 0.9));
    expect(two.state).toBe("exorcised");
    expect(at(two, scoredAt(7000, 0.9)).state).toBe("possession");
  });

  it("5.2/5.3 as written: Exorcised follows low scores to Mask or Unease", () => {
    const exorcised = at(possessed, { type: "protocol-completed", at: 4000 });
    expect(at(exorcised, scoredAt(5000, 0.1)).state).toBe("mask");
    expect(at(exorcised, scoredAt(5000, 0.5)).state).toBe("unease");
  });

  it("5.8: silence for silenceMs shows Listening, except in Possession and Exorcised", () => {
    const mask = at(listening, scoredAt(1000, 0.1));
    expect(at(mask, { type: "silence", at: 3499 }).state).toBe("mask");
    expect(at(mask, { type: "silence", at: 3500 }).state).toBe("listening");
    expect(at(possessed, { type: "silence", at: 60_000 }).state).toBe("possession");
    const exorcised = at(possessed, { type: "protocol-completed", at: 4000 });
    expect(at(exorcised, { type: "silence", at: 60_000 }).state).toBe("exorcised");
  });

  it("silence neither counts toward nor breaks the confirmation", () => {
    const s = at(listening, scoredAt(1000, 0.9), scoredAt(2000, 0.9), {
      type: "silence",
      at: 2500,
    });
    expect(at(s, scoredAt(3000, 0.9)).state).toBe("possession");
  });

  it("5.9: capture-stopped returns to Idle with zeroed counters", () => {
    expect(at(possessed, { type: "capture-stopped", at: 5000 })).toEqual(INITIAL_STATE);
  });
});

describe("validateConfig (Requirement 5.10)", () => {
  it("accepts the defaults", () => {
    expect(validateConfig({ ...DEFAULT_CONFIG })).toEqual(DEFAULT_CONFIG);
  });

  it.each([
    ["release", { release: 0.7 }],
    ["release", { release: 0.8 }],
    ["unease", { unease: 0.71 }],
    ["alpha", { alpha: 0 }],
    ["possession", { possession: 1.2 }],
    ["confirmWindows", { confirmWindows: 0 }],
    ["releaseWindows", { releaseWindows: 1.5 }],
    ["silenceMs", { silenceMs: -1 }],
    ["maxPending", { maxPending: 0 }],
    ["unease", { unease: Number.NaN }],
  ])("rejects a bad %s", (key, override) => {
    const run = () => validateConfig({ ...DEFAULT_CONFIG, ...override });
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(new RegExp(`^${key}:`));
  });

  it("accepts unease equal to possession", () => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, unease: 0.7 })).not.toThrow();
  });
});

describe("resolveConfig", () => {
  it("takes thresholds from the manifest and lets overrides win", () => {
    const thresholds = { unease: 0.3, possession: 0.8, release: 0.6 };
    expect(resolveConfig({ thresholds })).toMatchObject({ ...thresholds, alpha: 0.4 });
    expect(resolveConfig({ thresholds }, { possession: 0.9 }).possession).toBe(0.9);
  });
});
