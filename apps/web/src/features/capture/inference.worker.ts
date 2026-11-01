/** Inference_Worker entry: binds worker-core to `self` and ONNX Runtime Web. */
import type { WorkerInbound, WorkerOutbound } from "@doppelganger/contracts";
import * as ort from "onnxruntime-web/wasm";
import { fetchManifest, fetchVerifiedModel } from "./model-loader.ts";
import { configureOrt, createOrtBackend } from "./ort-backend.ts";
import { createWorkerCore, type PortLike } from "./worker-core.ts";

// The DOM lib types `self` as a Window; this is the part of the worker scope used here.
const scope = self as unknown as {
  postMessage(message: WorkerOutbound): void;
  onmessage: ((event: MessageEvent<WorkerInbound>) => void) | null;
  crossOriginIsolated: boolean;
};

const fetchSameOrigin = (url: string) =>
  fetch(url, { credentials: "same-origin", cache: "no-cache", redirect: "error" });

configureOrt(ort, import.meta.env.BASE_URL, scope.crossOriginIsolated);

const core = createWorkerCore({
  post: (message) => scope.postMessage(message),
  loadManifest: (url) => fetchManifest(url, fetchSameOrigin),
  createBackend: (manifestUrl) =>
    createOrtBackend(ort, (manifest) => fetchVerifiedModel(manifest, manifestUrl, fetchSameOrigin)),
  clock: () => Date.now(),
  now: () => performance.now(),
  wasmSupported: typeof WebAssembly === "object",
  origin: location.origin,
  yieldNow: () => new Promise((resolve) => setTimeout(resolve, 0)),
});

scope.onmessage = (event) => {
  void core.handle(event.data, event.ports as readonly PortLike[]);
};
