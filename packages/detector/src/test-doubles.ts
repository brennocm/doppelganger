/**
 * Test doubles for the detector's tests: a manifest and an InferenceBackend whose outputs
 * and latency the test controls. Not exported from the package index.
 */
import type { ModelManifest } from "@doppelganger/contracts";
import type { InferenceBackend } from "./inference.ts";

export function testManifest(overrides: Partial<ModelManifest> = {}): ModelManifest {
  return {
    id: "test-fake",
    version: "0.0.0",
    role: "test",
    file: "test-fake.onnx",
    sha256: "0".repeat(64),
    bytes: 1,
    quantization: "fp32",
    sampleRate: 16000,
    windowSamples: 4,
    hopSamples: 4,
    input: "waveform",
    output: "logits",
    outputKind: "single-logit",
    spoofIndex: 0,
    calibration: { method: "temperature", temperature: 1 },
    thresholds: { unease: 0.4, possession: 0.7, release: 0.5 },
    license: { code: "MIT", weights: "MIT", trainingData: "none", verifiedOn: "2026-11-01" },
    source: "packages/detector/src/test-doubles.ts",
    ...overrides,
  };
}

/** The logit whose sigmoid (temperature 1) is the given probability. */
export const logit = (p: number) => Math.log(p / (1 - p));

export interface FakeBackend extends InferenceBackend {
  /** The first sample of every window passed to run(), in call order. */
  readonly seen: number[];
  /** Runs started but not yet settled. */
  readonly inFlight: number;
  /** Settle the oldest pending run (manual mode). Returns false if none is pending. */
  settle(): boolean;
}

/**
 * `respond(window)` gives the output (or throws to reject). With `manual: true`, run()
 * stays pending until settle() is called, so a test controls latency exactly.
 */
export function fakeBackend(
  respond: (window: Float32Array) => ArrayLike<number> = () => [0],
  { manual = false } = {},
): FakeBackend {
  const seen: number[] = [];
  const pending: (() => void)[] = [];
  return {
    seen,
    get inFlight() {
      return pending.length;
    },
    load: () => Promise.resolve(),
    dispose: () => Promise.resolve(),
    run(window) {
      seen.push(window[0] ?? Number.NaN);
      const result = () => Float32Array.from(respond(window));
      if (!manual) return Promise.resolve().then(result);
      return new Promise((resolve, reject) => {
        pending.push(() => {
          try {
            resolve(result());
          } catch (error) {
            reject(error);
          }
        });
      });
    },
    settle() {
      const next = pending.shift();
      next?.();
      return next !== undefined;
    },
  };
}

/** Let every queued promise callback run. */
export async function flush(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
