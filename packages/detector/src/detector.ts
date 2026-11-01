/** Detector pipeline: windows → voice activity → inference → score → smooth → machine. */
import type {
  DetectorConfig,
  DetectorUpdate,
  ModelManifest,
  SessionStats,
} from "@doppelganger/contracts";
import {
  type HauntingEvent,
  INITIAL_STATE,
  type MachineState,
  transition,
  validateConfig,
} from "./haunting-machine.ts";
import type { InferenceBackend } from "./inference.ts";
import { score } from "./scorer.ts";
import { createStatsTracker } from "./session-stats.ts";
import { createSmoother } from "./smoother.ts";
import { energyVoiceActivity, type VoiceActivity } from "./voice-activity.ts";
import { type AudioWindow, createWindower } from "./windower.ts";

/** Consecutive failed windows before an `inference-failed` update. */
export const FAILURES_BEFORE_ERROR = 3;

export interface DetectorOptions {
  manifest: ModelManifest;
  /** Already loaded with `manifest`. */
  backend: InferenceBackend;
  config: DetectorConfig;
  clock: () => number;
  /** Defaults to the energy and zero-crossing check with `config.vad`. */
  voiceActivity?: VoiceActivity;
}

export interface Detector {
  push(chunk: ArrayLike<number>): void;
  start(): void;
  stop(): void;
  completeProtocol(): void;
  subscribe(fn: (update: DetectorUpdate) => void): () => void;
  stats(): SessionStats;
  /** Windows waiting for processing, not counting the one in progress (Property 13). */
  pendingWindows(): number;
}

/** Throws a ConfigError at creation for an invalid configuration (Requirement 5.10). */
export function createDetector(opts: DetectorOptions): Detector {
  const { manifest, backend, clock } = opts;
  const config = validateConfig({ ...opts.config });
  const windower = createWindower(manifest);
  const smoother = createSmoother(config.alpha);
  const voiceActivity = opts.voiceActivity ?? energyVoiceActivity(config.vad);
  const hopMs = (manifest.hopSamples / manifest.sampleRate) * 1000;
  const stats = createStatsTracker(clock());
  const listeners = new Set<(update: DetectorUpdate) => void>();
  const queue: AudioWindow[] = [];
  let machine: MachineState = INITIAL_STATE;
  let lastSmoothed: number | null = null;
  let failures = 0;
  let draining = false;
  // Incremented by stop(): results of windows from an earlier capture are ignored.
  let generation = 0;

  function apply(event: HauntingEvent): void {
    const next = transition(machine, event, config);
    if (next.state !== machine.state) stats.transition(machine.state, next.state, event.at);
    machine = next;
  }

  function emit(update: Omit<DetectorUpdate, "state">): void {
    const full: DetectorUpdate = { state: machine.state, ...update };
    for (const fn of listeners) fn(full);
  }

  function fail(window: AudioWindow, at: number): void {
    stats.failed();
    failures += 1;
    if (failures >= FAILURES_BEFORE_ERROR) {
      emit({
        smoothed: lastSmoothed,
        raw: null,
        windowIndex: window.index,
        at,
        error: "inference-failed",
      });
    }
  }

  async function process(window: AudioWindow, gen: number): Promise<void> {
    let voiced: boolean;
    try {
      voiced = await voiceActivity(window.samples);
    } catch {
      voiced = false;
    }
    if (gen !== generation) return;
    if (!voiced) {
      const at = clock();
      apply({ type: "silence", at });
      emit({ smoothed: lastSmoothed, raw: null, windowIndex: window.index, at });
      return;
    }
    let output: Float32Array | null = null;
    try {
      output = await backend.run(window.samples);
    } catch {
      output = null;
    }
    if (gen !== generation) return;
    const at = clock();
    const result = output === null ? null : score(output, manifest);
    if (result === null || !result.ok) {
      stats.voiced(hopMs, null);
      fail(window, at);
      return;
    }
    failures = 0;
    const smoothed = smoother.next(result.score);
    lastSmoothed = smoothed;
    stats.voiced(hopMs, smoothed);
    apply({ type: "window-scored", at, smoothed });
    emit({ smoothed, raw: result.score, windowIndex: window.index, at });
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    const gen = generation;
    try {
      for (
        let next = queue.shift();
        next !== undefined && gen === generation;
        next = queue.shift()
      ) {
        await process(next, gen);
      }
    } finally {
      draining = false;
      if (queue.length > 0) void drain();
    }
  }

  return {
    push(chunk) {
      if (machine.state === "idle") return;
      for (const window of windower.push(chunk)) {
        queue.push(window);
        while (queue.length > config.maxPending) {
          queue.shift();
          stats.dropped();
        }
      }
      void drain();
    },
    start() {
      if (machine.state !== "idle") return;
      const at = clock();
      stats.reset(at);
      apply({ type: "capture-started", at });
      emit({ smoothed: null, raw: null, windowIndex: null, at });
    },
    stop() {
      if (machine.state === "idle") return;
      generation += 1;
      queue.length = 0;
      windower.reset();
      smoother.reset();
      lastSmoothed = null;
      failures = 0;
      const at = clock();
      apply({ type: "capture-stopped", at });
      emit({ smoothed: null, raw: null, windowIndex: null, at });
    },
    completeProtocol() {
      const at = clock();
      apply({ type: "protocol-completed", at });
      emit({ smoothed: lastSmoothed, raw: null, windowIndex: null, at });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    stats() {
      return stats.snapshot(clock());
    },
    pendingWindows() {
      return queue.length;
    },
  };
}
