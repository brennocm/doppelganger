import type { AutopsyReport } from "./generated/autopsy-report.ts";

/** Result of checking JSON against the AutopsyReport schema. */
export type AutopsyResult = { ok: true; report: AutopsyReport } | { ok: false; error: string };

type Check = (value: unknown) => boolean;

const STATES = ["idle", "listening", "mask", "unease", "possession", "exorcised"];
export const VERDICT_REASONS = [
  "Not enough speech",
  "Dissonance reached Possession",
  "Dissonance rose to Unease but never reached Possession",
  "Dissonance stayed low",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nonNegative: Check = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const unitOrNull: Check = (v) => v === null || (typeof v === "number" && v >= 0 && v <= 1);
const oneOf =
  (...values: readonly unknown[]): Check =>
  (v) =>
    values.includes(v);

function object(shape: Record<string, Check>): Check {
  return (v) =>
    isRecord(v) &&
    Object.keys(v).length === Object.keys(shape).length &&
    Object.entries(shape).every(([k, check]) => k in v && check(v[k]));
}

const window = object({
  index: (v) => Number.isInteger(v) && (v as number) >= 0,
  startS: nonNegative,
  endS: nonNegative,
  voiced: (v) => typeof v === "boolean",
  score: unitOrNull,
  smoothed: unitOrNull,
});
const segment = object({ from: nonNegative, to: nonNegative, state: oneOf(...STATES) });

/** Field checks mirroring schemas/autopsy-report.schema.json (kept in sync by tests). */
export const AUTOPSY_FIELDS: Readonly<Record<string, Check>> = {
  modelId: (v) => typeof v === "string" && /^[a-z0-9][a-z0-9.-]{0,63}$/.test(v),
  modelVersion: (v) => typeof v === "string" && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(v),
  durationS: nonNegative,
  windows: (v) => Array.isArray(v) && v.every(window),
  states: (v) => Array.isArray(v) && v.every(segment),
  verdict: oneOf("likely-human", "inconclusive", "likely-synthetic"),
  verdictReason: oneOf(...VERDICT_REASONS),
};

/** Validate JSON (for example an engine response) as an AutopsyReport. */
export function parseAutopsyReport(value: unknown): AutopsyResult {
  if (!isRecord(value)) return { ok: false, error: "report is not an object" };
  for (const key of Object.keys(value)) {
    if (!(key in AUTOPSY_FIELDS)) return { ok: false, error: `unknown field: ${key}` };
  }
  for (const [key, check] of Object.entries(AUTOPSY_FIELDS)) {
    if (!(key in value)) return { ok: false, error: `missing field: ${key}` };
    if (!check(value[key])) return { ok: false, error: `invalid field: ${key}` };
  }
  return { ok: true, report: value as unknown as AutopsyReport };
}
