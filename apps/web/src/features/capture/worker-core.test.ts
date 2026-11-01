import type {
  AudioChunkMessage,
  ModelManifest,
  WorkerInbound,
  WorkerOutbound,
} from "@doppelganger/contracts";
import type { InferenceBackend } from "@doppelganger/detector";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import committed from "../../../public/models/ci-synthetic-linear.json" with { type: "json" };
import { IntegrityError } from "./model-loader.ts";
import { createWorkerCore, PERF_EVERY, type PortLike } from "./worker-core.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;
const MANIFEST = { ...(committed as ModelManifest), windowSamples: 1600, hopSamples: 1600 };

function backend(outputs = () => Float32Array.of(-1, 1)): InferenceBackend {
  return {
    load: async () => undefined,
    run: async () => outputs(),
    dispose: async () => undefined,
  };
}

function setup(overrides: { load?: () => Promise<ModelManifest>; wasm?: boolean } = {}) {
  const posted: WorkerOutbound[] = [];
  let t = 0;
  const core = createWorkerCore({
    post: (m) => posted.push(m),
    loadManifest: overrides.load ?? (async () => MANIFEST),
    createBackend: () => backend(),
    clock: () => 1_000_000,
    now: () => (t += 4),
    wasmSupported: overrides.wasm ?? true,
    origin: "https://app.example",
  });
  const port: PortLike = { onmessage: null };
  const send = (samples: Float32Array) =>
    port.onmessage?.(
      new MessageEvent<AudioChunkMessage>("message", { data: { type: "chunk", samples } }),
    );
  return { core, posted, port, send };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const voiced = (n = 1600) =>
  Float32Array.from({ length: n }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 150 * i) / 16000));

/** True when a value, at any depth, is or holds binary data. */
function holdsBinary(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return true;
  if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) return true;
  if ((value as { constructor?: { name?: string } }).constructor?.name === "AudioBuffer")
    return true;
  return Object.values(value).some((v) => holdsBinary(v, seen));
}

describe("worker core", () => {
  it("loads the model, then scores audio from the port and posts updates", async () => {
    const { core, posted, port, send } = setup();
    await core.handle({ type: "init", manifestUrl: "https://app.example/models/m.json" });
    expect(posted[0]).toEqual({
      type: "ready",
      model: { id: MANIFEST.id, version: MANIFEST.version, role: "test", hopSamples: 1600 },
    });
    await core.handle({ type: "audio-port" }, [port]);
    await core.handle({ type: "start" });
    send(voiced());
    await flush();
    const updates = posted.filter((m) => m.type === "update");
    expect(updates.at(-1)).toMatchObject({ update: { windowIndex: 0, raw: expect.any(Number) } });
  });

  it("posts perf every PERF_EVERY scored windows", async () => {
    const { core, posted, port, send } = setup();
    await core.handle({ type: "init", manifestUrl: "https://app.example/m.json" });
    await core.handle({ type: "audio-port" }, [port]);
    await core.handle({ type: "start" });
    for (let i = 0; i < PERF_EVERY; i++) {
      send(voiced());
      await flush();
    }
    expect(posted.filter((m) => m.type === "perf")).toEqual([
      { type: "perf", p50: 4, p95: 4, windows: PERF_EVERY },
    ]);
  });

  it.each([
    ["model-integrity", async () => Promise.reject(new IntegrityError("bad hash"))],
    ["model-load", async () => Promise.reject(new Error("404"))],
  ] as const)("reports %s", async (code, load) => {
    const { core, posted } = setup({ load });
    await core.handle({ type: "init", manifestUrl: "https://app.example/m.json" });
    expect(posted).toEqual([{ type: "error", code }]);
  });

  it("reports wasm-unsupported without loading", async () => {
    const { core, posted } = setup({ wasm: false });
    await core.handle({ type: "init", manifestUrl: "https://app.example/m.json" });
    expect(posted).toEqual([{ type: "error", code: "wasm-unsupported" }]);
  });

  it("refuses a manifest from another origin without fetching it", async () => {
    let fetched = false;
    const { core, posted } = setup({
      load: async () => {
        fetched = true;
        return MANIFEST;
      },
    });
    await core.handle({ type: "init", manifestUrl: "https://evil.example/m.json" });
    expect(posted).toEqual([{ type: "error", code: "model-load" }]);
    expect(fetched).toBe(false);
  });

  it("ignores audio messages that are not chunks of float samples", async () => {
    const { core, posted, port } = setup();
    await core.handle({ type: "init", manifestUrl: "https://app.example/m.json" });
    await core.handle({ type: "audio-port" }, [port]);
    await core.handle({ type: "start" });
    // An untrusted message whose samples are not a Float32Array.
    const bogus = { type: "chunk", samples: [1, 2, 3] } as unknown as AudioChunkMessage;
    port.onmessage?.(new MessageEvent("message", { data: bogus }));
    await flush();
    expect(posted.filter((m) => m.type === "update" && m.update.windowIndex !== null)).toEqual([]);
  });

  // Feature: audio-capture, Property 5: Main thread never receives audio
  it("never posts a typed array, ArrayBuffer or AudioBuffer", async () => {
    const inbound = fc.oneof(
      fc.constant<WorkerInbound>({ type: "start" }),
      fc.constant<WorkerInbound>({ type: "stop" }),
      fc.constant<WorkerInbound>({ type: "protocol-completed" }),
      fc.constant<WorkerInbound>({ type: "stats" }),
    );
    const step = fc.oneof(
      {
        weight: 3,
        arbitrary: fc.integer({ min: 0, max: 4000 }).map((n) => ({ kind: "audio" as const, n })),
      },
      { weight: 1, arbitrary: inbound.map((m) => ({ kind: "message" as const, m })) },
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 40 }), async (steps) => {
        const { core, posted, port, send } = setup();
        await core.handle({ type: "init", manifestUrl: "https://app.example/m.json" });
        await core.handle({ type: "audio-port" }, [port]);
        for (const s of steps) {
          if (s.kind === "audio") send(voiced(s.n));
          else await core.handle(s.m);
          await flush();
        }
        await core.handle({ type: "stats" });
        for (const message of posted) expect(holdsBinary(message)).toBe(false);
        expect(holdsBinary({ nested: [{ x: new Float32Array(1) }] })).toBe(true);
      }),
      RUNS,
    );
  });
});
