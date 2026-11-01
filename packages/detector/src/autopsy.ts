/**
 * Autopsy (autopsy-mode): batch analysis of a whole recording with the same windower,
 * voice activity check, scorer and smoother as live detection, and the verdict derived by
 * replaying the haunting machine. Reports carry numbers only.
 */
import type {
  AutopsyReport,
  AutopsySegment,
  AutopsyWindow,
  DetectorConfig,
  HauntingState,
  ModelManifest,
} from "@doppelganger/contracts";
import {
  type HauntingConfig,
  type HauntingEvent,
  INITIAL_STATE,
  type MachineState,
  transition,
  validateConfig,
} from "./haunting-machine.ts";
import type { InferenceBackend } from "./inference.ts";
import { score } from "./scorer.ts";
import { createSmoother } from "./smoother.ts";
import { energyVoiceActivity, type VoiceActivity } from "./voice-activity.ts";
import { createWindower } from "./windower.ts";

export type { AutopsyReport, AutopsyWindow };

export const MIN_SCORED_WINDOWS = 3;
export const PROGRESS_EVERY = 10;

type VerdictPart = Pick<AutopsyReport, "states" | "verdict" | "verdictReason">;

/** Replays `transition` over the windows; never a second copy of the machine's rules. */
export function deriveVerdict(windows: readonly AutopsyWindow[], cfg: HauntingConfig): VerdictPart {
  let s: MachineState = transition(INITIAL_STATE, { type: "capture-started", at: 0 }, cfg);
  let reachedPossession = false;
  let reachedUnease = false;
  const states: AutopsySegment[] = [];
  for (const w of windows) {
    const at = w.startS * 1000;
    const event: HauntingEvent =
      w.score !== null && w.smoothed !== null
        ? { type: "window-scored", at, smoothed: w.smoothed }
        : { type: "silence", at };
    s = transition(s, event, cfg);
    reachedPossession ||= s.state === "possession";
    reachedUnease ||= s.state === "unease";
    const last = states.at(-1);
    if (last !== undefined && last.state === s.state && last.to >= w.startS) last.to = w.endS;
    else states.push({ from: w.startS, to: w.endS, state: s.state as HauntingState });
  }
  const scored = windows.filter((w) => w.score !== null).length;
  if (scored < MIN_SCORED_WINDOWS)
    return { states, verdict: "inconclusive", verdictReason: "Not enough speech" };
  if (reachedPossession)
    return { states, verdict: "likely-synthetic", verdictReason: "Dissonance reached Possession" };
  if (reachedUnease) {
    return {
      states,
      verdict: "inconclusive",
      verdictReason: "Dissonance rose to Unease but never reached Possession",
    };
  }
  return { states, verdict: "likely-human", verdictReason: "Dissonance stayed low" };
}

export interface AutopsyRunnerOptions {
  manifest: ModelManifest;
  /** Already loaded with `manifest`. */
  backend: InferenceBackend;
  config: DetectorConfig;
  voiceActivity?: VoiceActivity;
  /**
   * Lets other work (such as a cancel message) run between batches of windows. The worker
   * passes a macrotask yield; the default is a microtask, which suits tests.
   */
  yieldNow?: () => Promise<void>;
}

export interface AutopsyRun {
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}

export type AutopsyOutcome = { cancelled: true } | { cancelled: false; report: AutopsyReport };

export function createAutopsyRunner(opts: AutopsyRunnerOptions) {
  const config = validateConfig({ ...opts.config });
  const voiceActivity = opts.voiceActivity ?? energyVoiceActivity(config.vad);
  const yieldNow = opts.yieldNow ?? (() => Promise.resolve());
  const { manifest } = opts;
  const rate = manifest.sampleRate;

  return {
    /** Analyze 16 kHz mono samples. The caller should drop its reference after the call. */
    async run(samples: Float32Array, run: AutopsyRun = {}): Promise<AutopsyOutcome> {
      const windower = createWindower(manifest);
      const smoother = createSmoother(config.alpha);
      const audioWindows = windower.push(samples);
      const total = audioWindows.length;
      const windows: AutopsyWindow[] = [];
      for (const [n, w] of audioWindows.entries()) {
        if (run.isCancelled?.()) return { cancelled: true };
        let voiced = false;
        try {
          voiced = await voiceActivity(w.samples);
        } catch {
          voiced = false;
        }
        let raw: number | null = null;
        let smoothed: number | null = null;
        if (voiced) {
          try {
            const result = score(await opts.backend.run(w.samples), manifest);
            if (result.ok) {
              raw = result.score;
              smoothed = smoother.next(result.score);
            }
          } catch {
            // A failed window is reported unscored, as in live detection.
          }
        }
        windows.push({
          index: w.index,
          startS: w.startSample / rate,
          endS: (w.startSample + manifest.windowSamples) / rate,
          voiced,
          score: raw,
          smoothed,
        });
        // The window's samples are not kept: only the numbers above.
        audioWindows[n] = { ...w, samples: new Float32Array(0) };
        if ((n + 1) % PROGRESS_EVERY === 0 || n + 1 === total) {
          run.onProgress?.(n + 1, total);
          await yieldNow();
        }
      }
      if (run.isCancelled?.()) return { cancelled: true };
      return {
        cancelled: false,
        report: {
          modelId: manifest.id,
          modelVersion: manifest.version,
          durationS: samples.length / rate,
          windows,
          ...deriveVerdict(windows, config),
        },
      };
    },
  };
}
