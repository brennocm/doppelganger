/**
 * Incident_Summary (exorcism-protocol Requirement 3): plain text and JSON from SessionStats.
 * No audio, levels, URLs, titles or file names; the only input strings are validated IDs
 * and versions, so nothing user-supplied can reach it.
 */
import {
  type HauntingState,
  type IncidentSummary,
  parseIncidentSummary,
  type SessionStats,
} from "@doppelganger/contracts";
import { HAUNTING_STATES } from "./haunting-machine.ts";

export type Step = 1 | 2 | 3 | 4;

export interface SummaryInput {
  stats: SessionStats;
  source: "tab" | "mic" | "replay";
  replayLabel?: "genuine" | "synthetic";
  model: { id: string; version: string };
  appVersion: string;
  stepsDone: ReadonlyArray<Step>;
  /** Epoch ms. */
  endedAt: number;
  /** Minutes east of UTC (for example −180 for UTC−03:00). */
  timeZoneOffsetMinutes: number;
}

export const SUMMARY_NOTE =
  "The dissonance score is a probabilistic estimate that the voice was synthetic. It is not proof.";

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const SOURCE_TEXT = { tab: "call tab", mic: "microphone", replay: "replay" } as const;

export class SummaryInputError extends Error {
  override readonly name = "SummaryInputError";
}

const pad = (n: number, width = 2) => String(Math.trunc(Math.abs(n))).padStart(width, "0");

/** ISO 8601 with the given offset, for example 2026-11-20T14:03:12-03:00. */
export function isoWithOffset(epochMs: number, offsetMinutes: number): string {
  const shifted = new Date(Math.round(epochMs) + offsetMinutes * 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const offset = `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`;
  return `${shifted.toISOString().slice(0, 19)}${offset}`;
}

function clock(epochMs: number, offsetMinutes: number): string {
  return isoWithOffset(epochMs, offsetMinutes).slice(11, 19);
}

/** "4 min 51 s", "52 s", "0 s". */
export function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

const percent = (v: number | null) =>
  v === null ? null : Math.round(Math.min(1, Math.max(0, v)) * 100);

function check(input: SummaryInput): void {
  if (!MODEL_ID.test(input.model.id))
    throw new SummaryInputError("model id has an unexpected form");
  if (!VERSION.test(input.model.version)) throw new SummaryInputError("model version is not x.y.z");
  if (!VERSION.test(input.appVersion)) throw new SummaryInputError("app version is not x.y.z");
  if (!Number.isFinite(input.endedAt)) throw new SummaryInputError("endedAt is not a time");
  const offset = input.timeZoneOffsetMinutes;
  if (!Number.isInteger(offset) || Math.abs(offset) > 14 * 60) {
    throw new SummaryInputError("time zone offset out of range");
  }
}

export function buildIncidentSummary(input: SummaryInput): { text: string; json: IncidentSummary } {
  check(input);
  if (input.source === "replay" && input.replayLabel === undefined) {
    // Never guess a clip's label: a wrong label would misreport the demo.
    throw new SummaryInputError("a replay summary needs the clip label");
  }
  const { stats, timeZoneOffsetMinutes: tz } = input;
  const steps = [...new Set(input.stepsDone)].sort() as Step[];
  const replay =
    input.source === "replay" && input.replayLabel !== undefined
      ? { label: input.replayLabel }
      : null;
  const secondsInState = Object.fromEntries(
    HAUNTING_STATES.map((s) => [s, Math.round(stats.msInState[s] / 100) / 10]),
  ) as Record<HauntingState, number>;
  const json: IncidentSummary = {
    schemaVersion: 1,
    replay: replay === null ? null : { label: replay.label },
    startedAt: stats.startedAt === null ? null : isoWithOffset(stats.startedAt, tz),
    endedAt: isoWithOffset(input.endedAt, tz),
    source: input.source,
    voicedSeconds: Math.round(stats.voicedMs / 100) / 10,
    dissonance: { peak: percent(stats.peak), mean: percent(stats.meanSmoothed) },
    secondsInState,
    transitions: stats.transitions.map((t) => ({
      from: t.from,
      to: t.to,
      at: isoWithOffset(t.at, tz),
    })),
    model: { id: input.model.id, version: input.model.version },
    appVersion: input.appVersion,
    stepsDone: steps,
    note: SUMMARY_NOTE,
  };
  // Fail closed: the summary leaves the page only if it matches its schema.
  const checked = parseIncidentSummary(json);
  if (!checked.ok)
    throw new SummaryInputError(`summary does not match its schema (${checked.error})`);

  const lines: string[] = [];
  lines.push(
    replay === null
      ? "Doppelgänger incident summary"
      : `Replay session (clip labelled ${replay.label}), not a live call. Doppelgänger incident summary`,
  );
  lines.push(`Started: ${json.startedAt ?? "not recorded"}   Ended: ${json.endedAt}`);
  lines.push(
    `Source: ${SOURCE_TEXT[input.source]}   Voiced speech: ${duration(json.voicedSeconds)}`,
  );
  const d = json.dissonance;
  lines.push(
    d.peak === null
      ? "Dissonance: no speech was scored"
      : `Dissonance: peak ${d.peak}, mean ${d.mean ?? d.peak}`,
  );
  const spent = HAUNTING_STATES.filter((s) => s !== "idle" && secondsInState[s] >= 0.5).map(
    (s) => `${s} ${duration(secondsInState[s])}`,
  );
  lines.push(`Time in states: ${spent.length > 0 ? spent.join(", ") : "none"}`);
  for (const t of stats.transitions) {
    if (t.to === "possession") lines.push(`Possession entered at ${clock(t.at, tz)}`);
  }
  lines.push(`Protocol steps done: ${steps.length > 0 ? steps.join(", ") : "none"}`);
  lines.push(`Model: ${json.model.id} ${json.model.version}   App: ${json.appVersion}`);
  lines.push(SUMMARY_NOTE);
  return { text: `${lines.join("\n")}\n`, json };
}
