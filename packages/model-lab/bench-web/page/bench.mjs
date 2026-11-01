// ONNX Runtime Web latency benchmark (detection-model Requirement 2.3).
// Single-thread WASM with SIMD, as on GitHub Pages. Everything is served from 'self'.
import * as ort from "/ort/ort.wasm.min.mjs";

const params = new URLSearchParams(location.search);
const manifestUrl = params.get("manifest") ?? "/models/ci-synthetic-linear.json";
const windows = Number(params.get("windows") ?? "50");
const warmup = 3;

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

function percentile(sorted, q) {
  const position = (sorted.length - 1) * (q / 100);
  const low = Math.floor(position);
  const high = Math.min(low + 1, sorted.length - 1);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

async function run() {
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  const manifest = await (await fetch(manifestUrl)).json();
  const bytes = await (
    await fetch(new URL(manifest.file, new URL(manifestUrl, location.href)))
  ).arrayBuffer();
  if (bytes.byteLength !== manifest.bytes || (await sha256Hex(bytes)) !== manifest.sha256) {
    throw new Error("model does not match its manifest SHA-256");
  }
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
  // Seeded LCG so every run feeds the same windows.
  let state = 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 31 - 1;
  };
  const input = new Float32Array(manifest.windowSamples);
  const times = [];
  for (let i = 0; i < warmup + windows; i++) {
    for (let j = 0; j < input.length; j++) input[j] = next();
    const feeds = { [manifest.input]: new ort.Tensor("float32", input, [1, input.length]) };
    const start = performance.now();
    const out = await session.run(feeds);
    const elapsed = performance.now() - start;
    if (!Array.from(out[manifest.output].data).every(Number.isFinite)) {
      throw new Error("model output is not finite");
    }
    if (i >= warmup) times.push(elapsed);
  }
  await session.release();
  const sorted = [...times].sort((a, b) => a - b);
  return {
    runtime: "onnxruntime-web-wasm-simd-1-thread",
    model: manifest.id,
    windows,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    userAgent: navigator.userAgent,
  };
}

run().then(
  (result) => {
    window.benchResult = result;
    document.getElementById("status").textContent = "Done";
  },
  (error) => {
    window.benchError = String(error);
    document.getElementById("status").textContent = "Failed";
  },
);
