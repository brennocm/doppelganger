import type { ModelManifest } from "./generated/model-manifest.ts";

/** Result of checking untrusted JSON against the ModelManifest schema. */
export type ManifestResult = { ok: true; manifest: ModelManifest } | { ok: false; error: string };

type Check = (value: unknown) => boolean;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str =
  (pattern?: RegExp): Check =>
  (v) =>
    typeof v === "string" && v.length > 0 && (pattern === undefined || pattern.test(v));
const int =
  (min: number, max = Number.MAX_SAFE_INTEGER): Check =>
  (v) =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const unit: Check = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const oneOf =
  (...values: readonly unknown[]): Check =>
  (v) =>
    values.includes(v);

function object(shape: Record<string, Check>, optional: readonly string[] = []): Check {
  return (v) => {
    if (!isRecord(v)) return false;
    for (const key of Object.keys(v)) if (!(key in shape)) return false;
    return Object.entries(shape).every(([key, check]) =>
      key in v ? check(v[key]) : optional.includes(key),
    );
  };
}

/** Field checks mirroring schemas/model-manifest.schema.json (kept in sync by tests). */
export const MANIFEST_FIELDS: Readonly<Record<string, Check>> = {
  id: str(/^[a-z0-9][a-z0-9.-]{0,63}$/),
  version: str(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  role: oneOf("light", "pro", "test"),
  file: str(/^[A-Za-z0-9][A-Za-z0-9._-]*\.onnx$/),
  url: str(/^https:\/\//),
  sha256: str(/^[0-9a-f]{64}$/),
  bytes: int(1),
  quantization: oneOf("fp32", "int8"),
  sampleRate: oneOf(16000),
  windowSamples: int(1),
  hopSamples: int(1),
  input: str(),
  output: str(),
  outputKind: oneOf("single-logit", "two-class-logits"),
  spoofIndex: int(0, 1),
  calibration: object({
    method: oneOf("temperature"),
    temperature: (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  }),
  thresholds: object({ unease: unit, possession: unit, release: unit }),
  license: object({
    code: str(),
    weights: str(),
    trainingData: str(),
    verifiedOn: str(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  }),
  source: str(),
};
const OPTIONAL: readonly string[] = ["url"];

/** Validate untrusted JSON (for example a fetched manifest) as a ModelManifest. */
export function parseModelManifest(value: unknown): ManifestResult {
  if (!isRecord(value)) return { ok: false, error: "manifest is not an object" };
  for (const key of Object.keys(value)) {
    if (!(key in MANIFEST_FIELDS)) return { ok: false, error: `unknown field: ${key}` };
  }
  for (const [key, check] of Object.entries(MANIFEST_FIELDS)) {
    if (!(key in value)) {
      if (OPTIONAL.includes(key)) continue;
      return { ok: false, error: `missing field: ${key}` };
    }
    if (!check(value[key])) return { ok: false, error: `invalid field: ${key}` };
  }
  return { ok: true, manifest: value as unknown as ModelManifest };
}
