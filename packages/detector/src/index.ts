/** Pure detection logic. No DOM, no Web Audio, no onnxruntime. */
export const PACKAGE_NAME = "@doppelganger/detector";

export type { InferenceBackend } from "./inference.ts";
export { type ScoreResult, score, sigmoid } from "./scorer.ts";
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
