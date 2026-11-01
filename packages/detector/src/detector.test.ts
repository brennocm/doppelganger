import type { DetectorUpdate } from "@doppelganger/contracts";
import { describe, expect, it } from "vitest";
import { createDetector, type DetectorOptions } from "./detector.ts";
import { DEFAULT_CONFIG } from "./haunting-machine.ts";
import { fakeBackend, flush, logit, testManifest } from "./test-doubles.ts";
import { neuralVoiceActivity } from "./voice-activity.ts";
import { ConfigError } from "./windower.ts";

/** One 4-sample window (testManifest) whose samples all equal `value`. */
const win = (value = 0.5) => [value, value, value, value];

function setup(overrides: Partial<DetectorOptions> = {}) {
  let now = 0;
  const backend = overrides.backend ?? fakeBackend(() => [logit(0.9)]);
  const detector = createDetector({
    manifest: testManifest(),
    backend,
    config: { ...DEFAULT_CONFIG, alpha: 1 },
    clock: () => now,
    ...overrides,
  });
  const updates: DetectorUpdate[] = [];
  detector.subscribe((u) => updates.push(u));
  const tick = (ms: number) => {
    now += ms;
  };
  return { detector, backend, updates, tick };
}

describe("createDetector (Requirements 2, 3, 7)", () => {
  it("ignores samples before start", async () => {
    const { detector, updates } = setup();
    detector.push(win());
    await flush();
    expect(updates).toEqual([]);
  });

  it("scores voiced windows, smooths them and drives the machine to Possession", async () => {
    const { detector, updates, tick } = setup();
    detector.start();
    for (let i = 0; i < 3; i++) {
      tick(250);
      detector.push(win());
      await flush();
    }
    expect(updates.map((u) => u.state)).toEqual(["listening", "unease", "unease", "possession"]);
    expect(updates.at(-1)).toMatchObject({ windowIndex: 2, at: 750 });
    expect(updates.at(-1)?.raw).toBeCloseTo(0.9, 6);
  });

  it("skips inference for unvoiced windows and reports them as silence", async () => {
    const { detector, backend, updates } = setup();
    detector.start();
    detector.push(win(0));
    await flush();
    expect((backend as ReturnType<typeof fakeBackend>).seen).toEqual([]);
    expect(updates.at(-1)).toMatchObject({ state: "listening", raw: null, windowIndex: 0 });
  });

  it("uses a neural voice activity model through the InferenceBackend (Requirement 2.3)", async () => {
    const vad = fakeBackend(() => [0.1]);
    const { detector, backend, updates } = setup({ voiceActivity: neuralVoiceActivity(vad) });
    detector.start();
    detector.push(win());
    await flush();
    expect(vad.seen).toEqual([0.5]);
    expect((backend as ReturnType<typeof fakeBackend>).seen).toEqual([]);
    expect(updates.at(-1)?.raw).toBeNull();
  });

  it("rejects invalid-output without touching the smoother (Requirement 3.2)", async () => {
    const outputs = [[logit(0.2)], [Number.NaN], [logit(0.6)]];
    const { detector, updates } = setup({
      backend: fakeBackend(() => outputs.shift() ?? [0]),
      config: { ...DEFAULT_CONFIG, alpha: 0.5 },
    });
    detector.start();
    for (let i = 0; i < 3; i++) {
      detector.push(win());
      await flush();
    }
    const scored = updates.filter((u) => u.raw !== null);
    expect(scored.map((u) => u.smoothed)).toEqual([expect.closeTo(0.2, 6), expect.closeTo(0.4, 6)]);
    expect(detector.stats().failedWindows).toBe(1);
  });

  it("emits inference-failed after three consecutive failures and recovers", async () => {
    let failing = true;
    const { detector, updates } = setup({
      backend: fakeBackend(() => {
        if (failing) throw new Error("backend crashed");
        return [logit(0.1)];
      }),
    });
    detector.start();
    for (let i = 0; i < 3; i++) {
      detector.push(win());
      await flush();
    }
    expect(updates.filter((u) => u.error === "inference-failed")).toHaveLength(1);
    failing = false;
    detector.push(win());
    await flush();
    expect(updates.at(-1)).toMatchObject({ state: "mask" });
    expect(updates.at(-1)?.error).toBeUndefined();
    expect(detector.stats().failedWindows).toBe(3);
  });

  it("drops the oldest waiting window beyond maxPending and keeps order (Requirement 7.2)", async () => {
    const backend = fakeBackend(() => [logit(0.1)], { manual: true });
    const { detector } = setup({ backend });
    detector.start();
    for (let i = 1; i <= 5; i++) detector.push(win(i / 8));
    await flush();
    expect(detector.pendingWindows()).toBe(2);
    while (backend.settle()) await flush();
    expect(backend.seen).toEqual([1 / 8, 4 / 8, 5 / 8]);
    expect(detector.stats().droppedWindows).toBe(2);
  });

  it("stop() ignores late results, clears the queue and returns to Idle", async () => {
    const backend = fakeBackend(() => [logit(0.9)], { manual: true });
    const { detector, updates } = setup({ backend });
    detector.start();
    detector.push([...win(), ...win(), ...win()]);
    await flush();
    detector.stop();
    expect(detector.pendingWindows()).toBe(0);
    backend.settle();
    await flush();
    expect(updates.at(-1)).toMatchObject({ state: "idle", smoothed: null });
    expect(backend.seen).toHaveLength(1);
  });

  it("completeProtocol() in Possession enters Exorcised", async () => {
    const { detector, updates } = setup();
    detector.start();
    for (let i = 0; i < 3; i++) {
      detector.push(win());
      await flush();
    }
    expect(updates.at(-1)?.state).toBe("possession");
    detector.completeProtocol();
    expect(updates.at(-1)?.state).toBe("exorcised");
  });

  it("unsubscribe stops updates", () => {
    const { detector } = setup();
    const seen: DetectorUpdate[] = [];
    const off = detector.subscribe((u) => seen.push(u));
    off();
    detector.start();
    expect(seen).toEqual([]);
  });

  it("throws a ConfigError naming the key", () => {
    expect(() => setup({ config: { ...DEFAULT_CONFIG, release: 0.9 } })).toThrow(/^release:/);
    expect(() => setup({ config: { ...DEFAULT_CONFIG, maxPending: 0 } })).toThrow(ConfigError);
  });
});

describe("session statistics (Requirement 6.1)", () => {
  it("tracks start, voiced time, peak, time per state and transitions", async () => {
    const { detector, tick } = setup({ manifest: testManifest({ hopSamples: 4 }) });
    tick(100);
    detector.start();
    for (let i = 0; i < 3; i++) {
      tick(1000);
      detector.push(win());
      await flush();
    }
    tick(500);
    const stats = detector.stats();
    expect(stats.startedAt).toBe(100);
    expect(stats.voicedMs).toBeCloseTo(3 * (4 / 16), 12);
    expect(stats.peak).toBeCloseTo(0.9, 6);
    expect(stats.scoredWindows).toBe(3);
    expect(stats.meanSmoothed).toBeCloseTo(0.9, 6);
    expect(stats.transitions).toEqual([
      { from: "idle", to: "listening", at: 100 },
      { from: "listening", to: "unease", at: 1100 },
      { from: "unease", to: "possession", at: 3100 },
    ]);
    expect(stats.msInState).toEqual({
      idle: 0,
      listening: 1000,
      mask: 0,
      unease: 2000,
      possession: 500,
      exorcised: 0,
    });
  });

  it("starts a fresh session on the next start and keeps the last one after stop", async () => {
    const { detector, tick } = setup();
    detector.start();
    detector.push(win());
    await flush();
    tick(10);
    detector.stop();
    expect(detector.stats().transitions).toHaveLength(3);
    detector.start();
    expect(detector.stats().transitions).toEqual([{ from: "idle", to: "listening", at: 10 }]);
  });
});
