/** Haunting_Machine: states with hysteresis and confirmation (Requirement 5). */
import type { DetectorConfig, HauntingState, ModelManifest } from "@doppelganger/contracts";
import { DEFAULT_VAD } from "./voice-activity.ts";
import { ConfigError } from "./windower.ts";

export type { HauntingState };

export type HauntingEvent =
  | { type: "capture-started"; at: number }
  | { type: "capture-stopped"; at: number }
  | { type: "window-scored"; at: number; smoothed: number }
  | { type: "silence"; at: number }
  | { type: "protocol-completed"; at: number };

export type HauntingConfig = Pick<
  DetectorConfig,
  "unease" | "possession" | "release" | "confirmWindows" | "releaseWindows" | "silenceMs"
>;

export interface MachineState {
  state: HauntingState;
  /** Consecutive scored windows with smoothed ≥ possession. */
  aboveCount: number;
  /** Consecutive scored windows with smoothed < release. */
  belowCount: number;
  lastVoicedAt: number | null;
}

export const HAUNTING_STATES: readonly HauntingState[] = [
  "idle",
  "listening",
  "mask",
  "unease",
  "possession",
  "exorcised",
];

export const DEFAULT_CONFIG: Readonly<DetectorConfig> = {
  alpha: 0.4,
  unease: 0.4,
  possession: 0.7,
  release: 0.5,
  confirmWindows: 3,
  releaseWindows: 5,
  silenceMs: 2500,
  maxPending: 2,
  vad: DEFAULT_VAD,
};

export const INITIAL_STATE: Readonly<MachineState> = {
  state: "idle",
  aboveCount: 0,
  belowCount: 0,
  lastVoicedAt: null,
};

/** Defaults, then the manifest's tuned thresholds, then explicit overrides. */
export function resolveConfig(
  manifest: Pick<ModelManifest, "thresholds">,
  overrides: Partial<DetectorConfig> = {},
): DetectorConfig {
  return { ...DEFAULT_CONFIG, ...manifest.thresholds, ...overrides };
}

function unit(key: string, value: number, { open = false } = {}): void {
  const ok = Number.isFinite(value) && value <= 1 && (open ? value > 0 : value >= 0);
  if (!ok) throw new ConfigError(key, open ? "must be in (0, 1]" : "must be in [0, 1]");
}

function count(key: string, value: number, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new ConfigError(key, `must be an integer ≥ ${min}`);
  }
}

/** Throws a ConfigError naming the first offending key (Requirement 5.10). */
export function validateConfig(cfg: DetectorConfig): DetectorConfig {
  unit("alpha", cfg.alpha, { open: true });
  unit("unease", cfg.unease);
  unit("possession", cfg.possession);
  unit("release", cfg.release);
  if (!(cfg.release < cfg.possession)) {
    throw new ConfigError("release", "must be below possession");
  }
  if (!(cfg.unease <= cfg.possession)) {
    throw new ConfigError("unease", "must not exceed possession");
  }
  count("confirmWindows", cfg.confirmWindows, 1);
  count("releaseWindows", cfg.releaseWindows, 1);
  count("silenceMs", cfg.silenceMs, 0);
  count("maxPending", cfg.maxPending, 1);
  if (!(Number.isFinite(cfg.vad.minRms) && cfg.vad.minRms >= 0)) {
    throw new ConfigError("vad.minRms", "must be ≥ 0");
  }
  unit("vad.maxZeroCrossingRate", cfg.vad.maxZeroCrossingRate);
  unit("vad.minVoicedFraction", cfg.vad.minVoicedFraction);
  return cfg;
}

function band(smoothed: number, cfg: HauntingConfig): HauntingState {
  return smoothed < cfg.unease ? "mask" : "unease";
}

function scored(s: MachineState, smoothed: number, at: number, cfg: HauntingConfig) {
  const aboveCount = smoothed >= cfg.possession ? s.aboveCount + 1 : 0;
  const belowCount = smoothed < cfg.release ? s.belowCount + 1 : 0;
  const next = { aboveCount, belowCount, lastVoicedAt: at };
  if (s.state === "possession") {
    return { ...next, state: belowCount >= cfg.releaseWindows ? band(smoothed, cfg) : s.state };
  }
  if (aboveCount >= cfg.confirmWindows) return { ...next, state: "possession" as const };
  // Exorcised is sticky: only re-possession (above) or capture-stopped leaves it.
  if (s.state === "exorcised") return { ...next, state: s.state };
  return { ...next, state: band(smoothed, cfg) };
}

/** Pure transition function. Events in Idle other than capture-started are ignored. */
export function transition(s: MachineState, e: HauntingEvent, cfg: HauntingConfig): MachineState {
  switch (e.type) {
    case "capture-started":
      return s.state === "idle" ? { ...INITIAL_STATE, state: "listening" } : s;
    case "capture-stopped":
      return { ...INITIAL_STATE };
    case "window-scored":
      return s.state === "idle" ? s : scored(s, e.smoothed, e.at, cfg);
    case "silence": {
      if (s.state === "idle" || s.state === "possession" || s.state === "exorcised") return s;
      const quiet = s.lastVoicedAt === null || e.at - s.lastVoicedAt >= cfg.silenceMs;
      return quiet && s.state !== "listening" ? { ...s, state: "listening" } : s;
    }
    case "protocol-completed":
      return s.state === "possession"
        ? { ...s, state: "exorcised", aboveCount: 0, belowCount: 0 }
        : s;
  }
}
