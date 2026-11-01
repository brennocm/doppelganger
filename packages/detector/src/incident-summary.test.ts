import { parseIncidentSummary, type SessionStats } from "@doppelganger/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HAUNTING_STATES } from "./haunting-machine.ts";
import {
  buildIncidentSummary,
  duration,
  isoWithOffset,
  type Step,
  SUMMARY_NOTE,
  type SummaryInput,
  SummaryInputError,
} from "./incident-summary.ts";
import { RUNS } from "./property-runs.ts";

const T0 = Date.UTC(2026, 10, 20, 17, 3, 12); // 14:03:12 at UTC−03:00

function stats(overrides: Partial<SessionStats> = {}): SessionStats {
  return {
    startedAt: T0,
    voicedMs: 291_000,
    peak: 0.91,
    msInState: {
      idle: 0,
      listening: 4_000,
      mask: 70_000,
      unease: 52_000,
      possession: 182_000,
      exorcised: 80_000,
    },
    transitions: [
      { from: "idle", to: "listening", at: T0 },
      { from: "listening", to: "mask", at: T0 + 4_000 },
      { from: "unease", to: "possession", at: T0 + 139_000 },
    ],
    droppedWindows: 0,
    failedWindows: 0,
    scoredWindows: 290,
    meanSmoothed: 0.63,
    ...overrides,
  };
}

const base: SummaryInput = {
  stats: stats(),
  source: "tab",
  model: { id: "aasist-l-codec-v1", version: "1.0.0" },
  appVersion: "0.4.0",
  stepsDone: [3, 1, 2],
  endedAt: T0 + 388_000,
  timeZoneOffsetMinutes: -180,
};

describe("buildIncidentSummary", () => {
  it("renders the design's example", () => {
    expect(buildIncidentSummary(base).text).toBe(
      [
        "Doppelgänger incident summary",
        "Started: 2026-11-20T14:03:12-03:00   Ended: 2026-11-20T14:09:40-03:00",
        "Source: call tab   Voiced speech: 4 min 51 s",
        "Dissonance: peak 91, mean 63",
        "Time in states: listening 4 s, mask 1 min 10 s, unease 52 s, possession 3 min 2 s, exorcised 1 min 20 s",
        "Possession entered at 14:05:31",
        "Protocol steps done: 1, 2, 3",
        "Model: aasist-l-codec-v1 1.0.0   App: 0.4.0",
        SUMMARY_NOTE,
        "",
      ].join("\n"),
    );
  });

  it("produces JSON that the schema validator accepts", () => {
    const { json } = buildIncidentSummary(base);
    expect(parseIncidentSummary(json)).toEqual({ ok: true, summary: json });
    expect(json.startedAt).toBe("2026-11-20T14:03:12-03:00");
    expect(json.stepsDone).toEqual([1, 2, 3]);
  });

  it("handles a session with no speech and no start", () => {
    const { text, json } = buildIncidentSummary({
      ...base,
      stats: stats({ startedAt: null, peak: null, meanSmoothed: null, transitions: [] }),
    });
    expect(text).toContain("Started: not recorded");
    expect(text).toContain("Dissonance: no speech was scored");
    expect(parseIncidentSummary(json).ok).toBe(true);
  });

  it.each([
    ["model id", { model: { id: "https://evil.example/x", version: "1.0.0" } }],
    ["model version", { model: { id: "m", version: "latest" } }],
    ["app version", { appVersion: "0.4.0 <script>" }],
    ["offset", { timeZoneOffsetMinutes: 30.5 }],
  ])("rejects an unexpected %s", (_, override) => {
    expect(() => buildIncidentSummary({ ...base, ...override })).toThrow(SummaryInputError);
  });

  it("formats offsets and durations", () => {
    expect(isoWithOffset(Date.UTC(2026, 0, 1, 0, 0, 0), 330)).toBe("2026-01-01T05:30:00+05:30");
    expect(isoWithOffset(Date.UTC(2026, 0, 1, 0, 0, 0), 0)).toBe("2026-01-01T00:00:00+00:00");
    expect(duration(0)).toBe("0 s");
    expect(duration(61)).toBe("1 min 1 s");
  });
});

// Generators for any SummaryInput, with edge values.
const ms = fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 10 * 3_600_000 }));
const time = fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 0, 1) });
const state = fc.constantFrom(...HAUNTING_STATES);
const unit = fc.oneof(
  fc.constant(null),
  fc.constantFrom(0, 1),
  fc.double({ min: 0, max: 1, noNaN: true }),
);
const statsArb: fc.Arbitrary<SessionStats> = fc.record({
  startedAt: fc.option(time, { nil: null }),
  voicedMs: ms,
  peak: unit,
  msInState: fc.record({
    idle: ms,
    listening: ms,
    mask: ms,
    unease: ms,
    possession: ms,
    exorcised: ms,
  }),
  transitions: fc.array(fc.record({ from: state, to: state, at: time }), { maxLength: 30 }),
  droppedWindows: fc.nat(),
  failedWindows: fc.nat(),
  scoredWindows: fc.nat(),
  meanSmoothed: unit,
});
const inputArb: fc.Arbitrary<SummaryInput> = fc.record({
  stats: statsArb,
  source: fc.constantFrom("tab" as const, "mic" as const, "replay" as const),
  replayLabel: fc.constantFrom("genuine" as const, "synthetic" as const),
  model: fc.record({
    id: fc.stringMatching(/^[a-z0-9][a-z0-9.-]{0,63}$/),
    version: fc.tuple(fc.nat(99), fc.nat(99), fc.nat(99)).map((v) => v.join(".")),
  }),
  appVersion: fc.tuple(fc.nat(99), fc.nat(99), fc.nat(99)).map((v) => v.join(".")),
  stepsDone: fc.subarray<Step>([1, 2, 3, 4]),
  endedAt: time,
  timeZoneOffsetMinutes: fc.integer({ min: -720, max: 840 }),
});

describe("Incident_Summary properties", () => {
  // Feature: exorcism-protocol, Property 1: Summary excludes forbidden data
  it("validates against the schema and carries no URL, path or other free text", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const { text, json } = buildIncidentSummary(input);
        expect(parseIncidentSummary(json).ok).toBe(true);
        expect(Object.keys(json).sort()).toEqual([
          "appVersion",
          "dissonance",
          "endedAt",
          "model",
          "note",
          "replay",
          "schemaVersion",
          "secondsInState",
          "source",
          "startedAt",
          "stepsDone",
          "transitions",
          "voicedSeconds",
        ]);
        for (const out of [text, JSON.stringify(json)]) {
          expect(out).not.toMatch(/:\/\/|\\|\.(ogg|wav|mp3|webm|opus|flac)\b/i);
        }
        // The only input strings in the text are the model ID and the versions: once they
        // are removed, only the fixed template's words, numbers and punctuation remain.
        let rest = text;
        for (const s of [input.model.id, input.model.version, input.appVersion])
          rest = rest.split(s).join("");
        expect(rest).toMatch(/^[A-Za-zä0-9 :,.()+\-\n]*$/);
      }),
      RUNS,
    );
  });

  it("rejects any model ID or version that is not in the expected form", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (s) => {
        const ok = /^[a-z0-9][a-z0-9.-]{0,63}$/.test(s);
        const run = () => buildIncidentSummary({ ...base, model: { id: s, version: "1.0.0" } });
        if (ok) expect(run).not.toThrow();
        else expect(run).toThrow(SummaryInputError);
      }),
      RUNS,
    );
  });

  // Feature: exorcism-protocol, Property 2: Summary is deterministic
  it("returns identical output for the same input", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(buildIncidentSummary(input)).toEqual(
          buildIncidentSummary(JSON.parse(JSON.stringify(input)) as SummaryInput),
        );
      }),
      RUNS,
    );
  });

  // Feature: exorcism-protocol, Property 3: Replay is always disclosed
  it("states a replay and its clip label in the first line", () => {
    fc.assert(
      fc.property(
        inputArb,
        fc.constantFrom("genuine" as const, "synthetic" as const),
        (input, label) => {
          const { text, json } = buildIncidentSummary({
            ...input,
            source: "replay",
            replayLabel: label,
          });
          const first = text.split("\n")[0] ?? "";
          expect(first).toMatch(/^Replay session/);
          expect(first).toContain(`labelled ${label}`);
          expect(json.replay).toEqual({ label });
        },
      ),
      RUNS,
    );
  });
});
