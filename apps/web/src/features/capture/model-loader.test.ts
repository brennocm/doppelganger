import type { ModelManifest } from "@doppelganger/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import committed from "../../../public/models/ci-synthetic-linear.json" with { type: "json" };
import {
  type Fetch,
  fetchManifest,
  fetchVerifiedModel,
  IntegrityError,
  ModelLoadError,
  modelUrl,
  sha256Hex,
  verifyModel,
} from "./model-loader.ts";

const RUNS = { numRuns: 200, seed: 20261101 } as const;
const MANIFEST_URL = "https://app.example/app/models/m.json";

function manifest(overrides: Partial<ModelManifest> = {}): ModelManifest {
  return { ...(committed as ModelManifest), ...overrides };
}

function fakeFetch(files: Record<string, unknown>): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const body = files[url];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      json: async () => body,
      arrayBuffer: async () => (body as Uint8Array).slice().buffer,
    };
  };
  return Object.assign(fn, { calls });
}

describe("model loading (Requirement 4.2)", () => {
  it("computes the SHA-256 that Python's hashlib computes", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("loads a manifest and its verified model from the same folder", async () => {
    const bytes = new TextEncoder().encode("model bytes");
    const m = manifest({ file: "m.onnx", bytes: bytes.length, sha256: await sha256Hex(bytes) });
    const fetchFn = fakeFetch({
      [MANIFEST_URL]: m,
      "https://app.example/app/models/m.onnx": bytes,
    });
    const parsed = await fetchManifest(MANIFEST_URL, fetchFn);
    expect(await fetchVerifiedModel(parsed, MANIFEST_URL, fetchFn)).toEqual(bytes);
  });

  it("rejects an invalid manifest and failed requests", async () => {
    await expect(
      fetchManifest(MANIFEST_URL, fakeFetch({ [MANIFEST_URL]: { id: "x" } })),
    ).rejects.toThrow(ModelLoadError);
    await expect(fetchManifest(MANIFEST_URL, fakeFetch({}))).rejects.toThrow(ModelLoadError);
  });

  it("refuses a model file that resolves to another origin", () => {
    expect(() => modelUrl(manifest({ file: "//evil.example/x.onnx" }), MANIFEST_URL)).toThrow(
      ModelLoadError,
    );
  });

  // Feature: audio-capture, Property 4: Integrity check
  it("accepts model bytes only when their SHA-256 and size match the manifest", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ maxLength: 512 }),
        fc.option(fc.uint8Array({ minLength: 0, maxLength: 512 }), { nil: undefined }),
        fc.boolean(),
        async (bytes, other, wrongSize) => {
          const hashed = other ?? bytes;
          const m = manifest({
            sha256: await sha256Hex(hashed),
            bytes: wrongSize ? bytes.length + 1 : bytes.length,
          });
          const same =
            !wrongSize && hashed.length === bytes.length && hashed.every((b, i) => b === bytes[i]);
          const result = verifyModel(bytes, m);
          if (same) await expect(result).resolves.toBeUndefined();
          else await expect(result).rejects.toThrow(IntegrityError);
        },
      ),
      RUNS,
    );
  });

  it("detects a single flipped bit in the committed test model's manifest hash", async () => {
    const bytes = new Uint8Array(16);
    const m = manifest({ bytes: 16, sha256: await sha256Hex(bytes) });
    bytes[7] = 1;
    await expect(verifyModel(bytes, m)).rejects.toThrow(IntegrityError);
  });
});
