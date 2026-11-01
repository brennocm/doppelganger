/**
 * Messages between the main thread, the capture worklet and the Inference_Worker
 * (audio-capture design, P25). Hand-written TS: they carry MessagePorts and typed arrays,
 * which JSON Schema cannot describe, and only TS uses them.
 */
import type { DetectorUpdate } from "./generated/detector-update.ts";
import type { ModelManifest } from "./generated/model-manifest.ts";
import type { SessionStats } from "./generated/session-stats.ts";

/** Main thread → worker. `audio-port` carries the worklet's MessagePort in `ports[0]`. */
export type WorkerInbound =
  | { type: "init"; manifestUrl: string }
  | { type: "audio-port" }
  | { type: "start" }
  | { type: "stop" }
  | { type: "protocol-completed" }
  | { type: "stats" };

export type WorkerErrorCode = "model-integrity" | "model-load" | "wasm-unsupported";

/** Worker → main thread. Never carries audio (audio-capture Requirement 4.4). */
export type WorkerOutbound =
  | { type: "ready"; model: Pick<ModelManifest, "id" | "version" | "role" | "hopSamples"> }
  | { type: "update"; update: DetectorUpdate }
  | { type: "perf"; p50: number; p95: number; windows: number }
  | { type: "stats"; stats: SessionStats }
  /** 64 band levels in [0, 1] per 100 ms chunk, as plain numbers (haunted-ui 3.1). */
  | { type: "levels"; bands: number[] }
  | { type: "error"; code: WorkerErrorCode };

/** Worklet → worker, on the dedicated audio port only. */
export interface AudioChunkMessage {
  type: "chunk";
  samples: Float32Array;
}
