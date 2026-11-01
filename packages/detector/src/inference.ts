/** Inference abstraction (Requirement 7.1): browser worker, local engine and test fakes. */
import type { ModelManifest } from "@doppelganger/contracts";

export interface InferenceBackend {
  /** Load and verify the model described by the manifest. */
  load(manifest: ModelManifest): Promise<void>;
  /** Run the model on one window of `manifest.windowSamples` samples. */
  run(window: Float32Array): Promise<Float32Array>;
  /** Release the model; the backend is unusable afterwards. */
  dispose(): Promise<void>;
}
