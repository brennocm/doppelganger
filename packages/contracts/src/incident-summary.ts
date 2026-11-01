import type { IncidentSummary } from "./generated/incident-summary.ts";

/** Result of checking JSON against the IncidentSummary schema. */
export type SummaryResult = { ok: true; summary: IncidentSummary } | { ok: false; error: string };

type Check = (value: unknown) => boolean;

/** The fixed note; the schema pins it with "const", so no free text can ride in it. */
export const SUMMARY_NOTE_TEXT =
  "The dissonance score is a probabilistic estimate that the voice was synthetic. It is not proof.";

const STATES = ["idle", "listening", "mask", "unease", "possession", "exorcised"] as const;
const ISO =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?[+-][0-9]{2}:[0-9]{2}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str =
  (pattern: RegExp): Check =>
  (v) =>
    typeof v === "string" && pattern.test(v);
const oneOf =
  (...values: readonly unknown[]): Check =>
  (v) =>
    values.includes(v);
const nonNegative: Check = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const percentOrNull: Check = (v) =>
  v === null || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100);

function object(shape: Record<string, Check>): Check {
  return (v) => {
    if (!isRecord(v)) return false;
    const keys = Object.keys(v);
    return (
      keys.length === Object.keys(shape).length &&
      keys.every((k) => k in shape) &&
      Object.entries(shape).every(([k, check]) => k in v && check(v[k]))
    );
  };
}

const transition = object({ from: oneOf(...STATES), to: oneOf(...STATES), at: str(ISO) });

/** Field checks mirroring schemas/incident-summary.schema.json (kept in sync by tests). */
export const SUMMARY_FIELDS: Readonly<Record<string, Check>> = {
  schemaVersion: oneOf(1),
  replay: (v) => v === null || object({ label: oneOf("genuine", "synthetic") })(v),
  startedAt: (v) => v === null || str(ISO)(v),
  endedAt: str(ISO),
  source: oneOf("tab", "mic", "replay"),
  voicedSeconds: nonNegative,
  dissonance: object({ peak: percentOrNull, mean: percentOrNull }),
  secondsInState: object(Object.fromEntries(STATES.map((s) => [s, nonNegative]))),
  transitions: (v) => Array.isArray(v) && v.every(transition),
  model: object({ id: str(MODEL_ID), version: str(VERSION) }),
  appVersion: str(VERSION),
  stepsDone: (v) => Array.isArray(v) && new Set(v).size === v.length && v.every(oneOf(1, 2, 3, 4)),
  note: oneOf(SUMMARY_NOTE_TEXT),
};

/** Validate JSON (for example a downloaded summary) as an IncidentSummary. */
export function parseIncidentSummary(value: unknown): SummaryResult {
  if (!isRecord(value)) return { ok: false, error: "summary is not an object" };
  for (const key of Object.keys(value)) {
    if (!(key in SUMMARY_FIELDS)) return { ok: false, error: `unknown field: ${key}` };
  }
  for (const [key, check] of Object.entries(SUMMARY_FIELDS)) {
    if (!(key in value)) return { ok: false, error: `missing field: ${key}` };
    if (!check(value[key])) return { ok: false, error: `invalid field: ${key}` };
  }
  return { ok: true, summary: value as unknown as IncidentSummary };
}
