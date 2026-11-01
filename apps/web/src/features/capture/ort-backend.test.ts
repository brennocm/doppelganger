import type { ModelManifest } from "@doppelganger/contracts";
import { describe, expect, it } from "vitest";
import committed from "../../../public/models/ci-synthetic-linear.json" with { type: "json" };
import { configureOrt, createOrtBackend, type OrtModule } from "./ort-backend.ts";

const MANIFEST = committed as ModelManifest;

function fakeOrt() {
  const created: { bytes: Uint8Array; options: unknown }[] = [];
  const released: number[] = [];
  const ort = {
    env: { wasm: {} as Record<string, unknown> },
    Tensor: class {
      constructor(
        readonly type: string,
        readonly data: Float32Array,
        readonly dims: number[],
      ) {}
    },
    InferenceSession: {
      create: async (bytes: Uint8Array, options: unknown) => {
        created.push({ bytes, options });
        return {
          run: async (feeds: Record<string, { data: Float32Array; dims: number[] }>) => {
            const input = feeds[MANIFEST.input];
            return { [MANIFEST.output]: { data: Float32Array.of(input?.dims[1] ?? -1, 0) } };
          },
          release: async () => {
            released.push(1);
          },
        };
      },
    },
  };
  return { ort: ort as unknown as OrtModule, raw: ort, created, released };
}

describe("ONNX Runtime Web backend (Requirement 4.1)", () => {
  it("self-hosts WASM under <base>ort/, with SIMD and one thread unless isolated", () => {
    const { ort, raw } = fakeOrt();
    configureOrt(ort, "/repo/app/", false);
    expect(raw.env.wasm).toEqual({
      wasmPaths: "/repo/app/ort/",
      simd: true,
      numThreads: 1,
      proxy: false,
    });
    configureOrt(ort, "/", true);
    expect(raw.env.wasm["numThreads"]).toBe(2);
  });

  it("creates the session from verified bytes and runs [1, window] tensors", async () => {
    const { ort, created, released } = fakeOrt();
    const bytes = Uint8Array.of(1, 2, 3);
    const backend = createOrtBackend(ort, async () => bytes);
    await expect(backend.run(new Float32Array(4))).rejects.toThrow("not loaded");
    await backend.load(MANIFEST);
    expect(created[0]?.bytes).toBe(bytes);
    expect(Array.from(await backend.run(new Float32Array(MANIFEST.windowSamples)))).toEqual([
      MANIFEST.windowSamples,
      0,
    ]);
    await backend.dispose();
    expect(released).toEqual([1]);
  });

  it("never creates a session when verification fails", async () => {
    const { ort, created } = fakeOrt();
    const backend = createOrtBackend(ort, async () => {
      throw new Error("integrity");
    });
    await expect(backend.load(MANIFEST)).rejects.toThrow("integrity");
    expect(created).toEqual([]);
  });
});
