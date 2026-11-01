/**
 * Inference_Worker logic with injected I/O (audio-capture design, P25). It owns the
 * detector; audio arrives only on the worklet's port, and only DetectorUpdate, perf,
 * stats and error messages leave (Requirement 4.4).
 */
import type {
  AudioChunkMessage,
  ModelManifest,
  WorkerInbound,
  WorkerOutbound,
} from "@doppelganger/contracts";
import {
  createAutopsyRunner,
  createDetector,
  createStatsTracker,
  type Detector,
  type InferenceBackend,
  resolveConfig,
} from "@doppelganger/detector";
import { bandLevels } from "./levels.ts";
import { IntegrityError } from "./model-loader.ts";

export const PERF_EVERY = 10;
const PERF_WINDOW = 50;

export interface WorkerCoreDeps {
  post(message: WorkerOutbound): void;
  loadManifest(url: string): Promise<ModelManifest>;
  /** A backend for the manifest; the core calls load(). */
  createBackend(manifestUrl: string): InferenceBackend;
  clock(): number;
  now(): number;
  wasmSupported: boolean;
  /** The worker's own origin; manifests from anywhere else are refused. */
  origin: string;
  /** Yields to the event loop between autopsy batches, so a cancel message can arrive. */
  yieldNow?: () => Promise<void>;
}

export interface PortLike {
  onmessage: ((event: MessageEvent<AudioChunkMessage>) => void) | null;
}

export interface WorkerCore {
  handle(message: WorkerInbound, ports?: readonly PortLike[]): Promise<void>;
}

function percentile(sorted: number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.min(low + 1, sorted.length - 1);
  return (sorted[low] ?? 0) + ((sorted[high] ?? 0) - (sorted[low] ?? 0)) * (position - low);
}

export function createWorkerCore(deps: WorkerCoreDeps): WorkerCore {
  let detector: Detector | null = null;
  let capturing = false;
  let loaded: { manifest: ModelManifest; backend: InferenceBackend } | null = null;
  let autopsyCancelled = false;
  let autopsyRunning = false;
  const timings: number[] = [];
  let runs = 0;

  function timed(backend: InferenceBackend): InferenceBackend {
    return {
      load: (m) => backend.load(m),
      dispose: () => backend.dispose(),
      async run(window) {
        const start = deps.now();
        try {
          return await backend.run(window);
        } finally {
          timings.push(deps.now() - start);
          if (timings.length > PERF_WINDOW) timings.shift();
          runs += 1;
          if (runs % PERF_EVERY === 0) {
            const sorted = [...timings].sort((a, b) => a - b);
            deps.post({
              type: "perf",
              p50: percentile(sorted, 0.5),
              p95: percentile(sorted, 0.95),
              windows: sorted.length,
            });
          }
        }
      },
    };
  }

  async function init(manifestUrl: string): Promise<void> {
    if (!deps.wasmSupported) {
      deps.post({ type: "error", code: "wasm-unsupported" });
      return;
    }
    try {
      // A dedicated worker on Pages has no CSP of its own, so the origin is checked here.
      if (new URL(manifestUrl).origin !== deps.origin)
        throw new Error("manifest is not same-origin");
      const manifest = await deps.loadManifest(manifestUrl);
      const backend = timed(deps.createBackend(manifestUrl));
      await backend.load(manifest);
      detector = createDetector({
        manifest,
        backend,
        config: resolveConfig(manifest),
        clock: deps.clock,
      });
      detector.subscribe((update) => deps.post({ type: "update", update }));
      loaded = { manifest, backend };
      const { id, version, role, hopSamples, thresholds } = manifest;
      deps.post({ type: "ready", model: { id, version, role, hopSamples, thresholds } });
    } catch (error) {
      deps.post({
        type: "error",
        code: error instanceof IntegrityError ? "model-integrity" : "model-load",
      });
    }
  }

  async function autopsy(samples: Float32Array): Promise<void> {
    // One model session: no autopsy while live capture runs, and one autopsy at a time.
    if (loaded === null || capturing || autopsyRunning || !(samples instanceof Float32Array)) {
      deps.post({ type: "autopsy-cancelled" });
      return;
    }
    autopsyRunning = true;
    autopsyCancelled = false;
    try {
      const runner = createAutopsyRunner({
        manifest: loaded.manifest,
        backend: loaded.backend,
        config: resolveConfig(loaded.manifest),
        ...(deps.yieldNow === undefined ? {} : { yieldNow: deps.yieldNow }),
      });
      const outcome = await runner.run(samples, {
        onProgress: (done, total) => deps.post({ type: "autopsy-progress", done, total }),
        isCancelled: () => autopsyCancelled,
      });
      deps.post(
        outcome.cancelled
          ? { type: "autopsy-cancelled" }
          : { type: "autopsy-report", report: outcome.report },
      );
    } finally {
      autopsyRunning = false;
    }
  }

  return {
    async handle(message, ports = []) {
      switch (message.type) {
        case "init":
          await init(message.manifestUrl);
          return;
        case "audio-port": {
          const port = ports[0];
          if (port === undefined) return;
          port.onmessage = (event) => {
            if (event.data?.type === "chunk" && event.data.samples instanceof Float32Array) {
              if (capturing) deps.post({ type: "levels", bands: bandLevels(event.data.samples) });
              detector?.push(event.data.samples);
            }
          };
          return;
        }
        case "start":
          capturing = detector !== null;
          detector?.start();
          return;
        case "stop":
          capturing = false;
          detector?.stop();
          return;
        case "protocol-completed":
          detector?.completeProtocol();
          return;
        case "autopsy":
          await autopsy(message.samples);
          return;
        case "autopsy-cancel":
          autopsyCancelled = true;
          return;
        case "stats":
          // Always answer, so a summary never waits: before the model loads, the session is empty.
          deps.post({
            type: "stats",
            stats: detector?.stats() ?? createStatsTracker(deps.clock()).snapshot(deps.clock()),
          });
          return;
      }
    },
  };
}
