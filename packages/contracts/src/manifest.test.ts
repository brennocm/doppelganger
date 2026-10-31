import { describe, expect, it } from "vitest";
import exampleJson from "../fixtures/model-manifest.example.json" with { type: "json" };
import schemaJson from "../schemas/model-manifest.schema.json" with { type: "json" };
import { MANIFEST_FIELDS, parseModelManifest } from "./index.ts";

const example: Record<string, unknown> = exampleJson;
const schema: { required: string[]; properties: Record<string, unknown> } = schemaJson;

describe("parseModelManifest", () => {
  it("accepts the example manifest", () => {
    expect(parseModelManifest(example)).toEqual({ ok: true, manifest: example });
  });

  it("checks exactly the fields of the JSON Schema", () => {
    expect(Object.keys(MANIFEST_FIELDS).sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it.each(schema.required)("rejects a manifest without %s", (key) => {
    const { [key]: _removed, ...rest } = example;
    expect(parseModelManifest(rest)).toEqual({ ok: false, error: `missing field: ${key}` });
  });

  it.each([
    ["sha256", "ABC"],
    ["sampleRate", 44100],
    ["spoofIndex", 2],
    ["windowSamples", 0],
    ["windowSamples", 1.5],
    ["role", "detector"],
    ["url", "http://example.com/model.onnx"],
    ["file", "../model.onnx"],
    ["calibration", { method: "temperature", temperature: 0 }],
    ["calibration", { method: "temperature", temperature: 1, extra: 1 }],
    ["thresholds", { unease: 0.4, possession: 1.2, release: 0.5 }],
    ["license", { code: "MIT", weights: "MIT", trainingData: "x", verifiedOn: "31/10/2026" }],
  ])("rejects an invalid %s", (key, value) => {
    expect(parseModelManifest({ ...example, [key]: value })).toEqual({
      ok: false,
      error: `invalid field: ${key}`,
    });
  });

  it("rejects unknown fields and non-objects", () => {
    expect(parseModelManifest({ ...example, extra: 1 })).toEqual({
      ok: false,
      error: "unknown field: extra",
    });
    expect(parseModelManifest(null).ok).toBe(false);
    expect(parseModelManifest([]).ok).toBe(false);
  });
});
