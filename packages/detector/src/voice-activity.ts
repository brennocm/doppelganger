/** Energy and zero-crossing voice activity check (Requirement 2). */
import type { VadConfig } from "@doppelganger/contracts";
import type { InferenceBackend } from "./inference.ts";

/** 20 ms at 16 kHz. A last frame shorter than half of this is ignored. */
export const VAD_FRAME_SAMPLES = 320;
const MIN_LAST_FRAME = VAD_FRAME_SAMPLES / 2;

export const DEFAULT_VAD: Readonly<VadConfig> = {
  minRms: 0.01,
  maxZeroCrossingRate: 0.35,
  minVoicedFraction: 0.3,
};

function frameIsVoiced(window: ArrayLike<number>, start: number, end: number, cfg: VadConfig) {
  let energy = 0;
  let crossings = 0;
  let previous = 0;
  for (let i = start; i < end; i++) {
    const v = window[i] ?? Number.NaN;
    if (!Number.isFinite(v)) return false;
    energy += v * v;
    if (i > start && v >= 0 !== previous >= 0) crossings += 1;
    previous = v;
  }
  const length = end - start;
  const rms = Math.sqrt(energy / length);
  const zcr = length > 1 ? crossings / (length - 1) : 0;
  return rms >= cfg.minRms && zcr <= cfg.maxZeroCrossingRate;
}

/** True when enough 20 ms frames of the window have speech-like energy and zero crossings. */
export function isVoiced(window: ArrayLike<number>, cfg: VadConfig): boolean {
  let frames = 0;
  let voiced = 0;
  for (let start = 0; start < window.length; start += VAD_FRAME_SAMPLES) {
    const end = Math.min(start + VAD_FRAME_SAMPLES, window.length);
    if (end - start < MIN_LAST_FRAME && frames > 0) break;
    frames += 1;
    if (frameIsVoiced(window, start, end, cfg)) voiced += 1;
  }
  return frames > 0 && voiced / frames >= cfg.minVoicedFraction;
}

/** Decides whether a window contains speech; the detector awaits it in window order. */
export type VoiceActivity = (window: Float32Array) => Promise<boolean>;

export function energyVoiceActivity(cfg: VadConfig): VoiceActivity {
  return (window) => Promise.resolve(isVoiced(window, cfg));
}

/**
 * Neural voice activity (Requirement 2.3) through an already loaded InferenceBackend whose
 * first output value is a speech probability. A non-finite output counts as unvoiced.
 */
export function neuralVoiceActivity(backend: InferenceBackend, threshold = 0.5): VoiceActivity {
  return async (window) => {
    const out = await backend.run(window);
    const p = out[0];
    return p !== undefined && Number.isFinite(p) && p >= threshold;
  };
}
