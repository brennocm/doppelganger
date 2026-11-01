/** Pure detection logic. No DOM, no Web Audio, no onnxruntime. */
export const PACKAGE_NAME = "@doppelganger/detector";

export {
  createDetector,
  type Detector,
  type DetectorOptions,
  FAILURES_BEFORE_ERROR,
} from "./detector.ts";
export {
  DEFAULT_CONFIG,
  HAUNTING_STATES,
  type HauntingConfig,
  type HauntingEvent,
  type HauntingState,
  INITIAL_STATE,
  type MachineState,
  resolveConfig,
  transition,
  validateConfig,
} from "./haunting-machine.ts";
export {
  buildIncidentSummary,
  duration,
  isoWithOffset,
  type Step,
  SUMMARY_NOTE,
  type SummaryInput,
  SummaryInputError,
} from "./incident-summary.ts";
export type { InferenceBackend } from "./inference.ts";
export { type ScoreResult, score, sigmoid } from "./scorer.ts";
export { createStatsTracker, type StatsTracker } from "./session-stats.ts";
export { createSmoother, type Smoother } from "./smoother.ts";
export {
  DEFAULT_VAD,
  energyVoiceActivity,
  isVoiced,
  neuralVoiceActivity,
  VAD_FRAME_SAMPLES,
  type VoiceActivity,
} from "./voice-activity.ts";
export {
  type AudioWindow,
  ConfigError,
  createWindower,
  type Windower,
  type WindowerConfig,
} from "./windower.ts";
