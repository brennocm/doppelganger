/** User-facing capture copy (audio-capture design, Error Handling; design-system voice). */
import type { WorkerErrorCode } from "@doppelganger/contracts";
import type { CaptureErrorCode } from "./sources.ts";

export const PRIVACY_NOTICE =
  "Audio is analyzed on this device. It is never recorded and never uploaded.";

export const TAB_UNSUPPORTED =
  "Listening to a call tab needs Chrome or Edge on a desktop computer. You can still use the microphone or a replay.";

export const SLOW_DEVICE =
  "This device is slower than the audio. Some seconds are skipped, so alerts may come later.";

export const TEST_MODEL = "Test model: it detects nothing. Scores are not meaningful.";

export const NO_REPLAY_CLIPS = "No replay clips are bundled yet.";

const CAPTURE: Record<CaptureErrorCode, string> = {
  "no-tab-audio":
    "That tab was shared without its audio. Share it again and turn on 'Share tab audio'.",
  "permission-denied":
    "Doppelgänger can't hear the call without permission. You can allow it in the address bar, or try a replay.",
  unsupported:
    "This browser can't capture that audio. Use a recent Chrome or Edge, or try a replay.",
  "replay-failed": "The replay clip could not be loaded. Reload the page and try again.",
};

const WORKER: Record<WorkerErrorCode, string> = {
  "model-integrity":
    "The detection model failed its integrity check, so it wasn't loaded. Reload the page; if this repeats, the files were altered.",
  "model-load": "The detection model could not be loaded. Reload the page to try again.",
  "wasm-unsupported": "This browser can't run the detector. Use a recent Chrome, Edge or Firefox.",
};

export function captureMessage(code: CaptureErrorCode): string {
  return CAPTURE[code];
}

export function workerMessage(code: WorkerErrorCode): string {
  return WORKER[code];
}

/** Whether the error should offer Replay as the way forward (Requirement 5.2). */
export function offersReplay(code: CaptureErrorCode): boolean {
  return code === "permission-denied" || code === "unsupported" || code === "no-tab-audio";
}

/** Requirement 4.3: p95 inference time above the hop duration means a slow device. */
export function isSlowDevice(p95Ms: number, hopSamples: number, sampleRate = 16000): boolean {
  return p95Ms > (hopSamples / sampleRate) * 1000;
}
