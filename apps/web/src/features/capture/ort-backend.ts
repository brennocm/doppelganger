/**
 * OrtWebBackend: the detector's InferenceBackend on ONNX Runtime Web (audio-capture
 * Requirement 4.1). WASM with SIMD, files self-hosted under `<base>ort/`, one thread
 * unless the page is cross-origin isolated (GitHub Pages never is).
 */
import type { ModelManifest } from "@doppelganger/contracts";
import type { InferenceBackend } from "@doppelganger/detector";
import type * as Ort from "onnxruntime-web/wasm";

export type OrtModule = Pick<typeof Ort, "env" | "InferenceSession" | "Tensor">;

export function configureOrt(ort: OrtModule, base: string, crossOriginIsolated: boolean): void {
  ort.env.wasm.wasmPaths = `${base}ort/`;
  ort.env.wasm.simd = true;
  ort.env.wasm.numThreads = crossOriginIsolated ? 2 : 1;
  ort.env.wasm.proxy = false;
}

/** `loadBytes` must return verified model bytes (see model-loader.ts). */
export function createOrtBackend(
  ort: OrtModule,
  loadBytes: (manifest: ModelManifest) => Promise<Uint8Array<ArrayBuffer>>,
): InferenceBackend {
  let session: Ort.InferenceSession | null = null;
  let io: { input: string; output: string } | null = null;
  return {
    async load(manifest) {
      const bytes = await loadBytes(manifest);
      session = await ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      io = { input: manifest.input, output: manifest.output };
    },
    async run(window) {
      if (session === null || io === null) throw new Error("model not loaded");
      const feeds = { [io.input]: new ort.Tensor("float32", window, [1, window.length]) };
      const out = await session.run(feeds);
      const data = out[io.output]?.data;
      if (!(data instanceof Float32Array)) throw new Error("model output is not float32");
      return data;
    },
    async dispose() {
      await session?.release();
      session = null;
    },
  };
}
