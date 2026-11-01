import { describe, expect, it } from "vitest";
import schemaJson from "../schemas/incident-summary.schema.json" with { type: "json" };
import { parseIncidentSummary, SUMMARY_FIELDS } from "./index.ts";

const schema: { required: string[]; properties: Record<string, unknown> } = schemaJson;

const example = {
  schemaVersion: 1,
  replay: null,
  startedAt: "2026-11-20T14:03:12-03:00",
  endedAt: "2026-11-20T14:09:40-03:00",
  source: "tab",
  voicedSeconds: 291,
  dissonance: { peak: 91, mean: 63 },
  secondsInState: { idle: 0, listening: 4, mask: 70, unease: 52, possession: 182, exorcised: 80 },
  transitions: [{ from: "idle", to: "listening", at: "2026-11-20T14:03:12-03:00" }],
  model: { id: "aasist-l-codec-v1", version: "1.0.0" },
  appVersion: "0.4.0",
  stepsDone: [1, 2, 3],
  note: "The dissonance score is a probabilistic estimate that the voice was synthetic. It is not proof.",
};

describe("parseIncidentSummary", () => {
  it("accepts a valid summary", () => {
    expect(parseIncidentSummary(example).ok).toBe(true);
  });

  it("checks exactly the fields of the JSON Schema", () => {
    expect(Object.keys(SUMMARY_FIELDS).sort()).toEqual(Object.keys(schema.properties).sort());
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it.each([
    ["url", "https://meet.example/abc"],
    ["tabTitle", "Weekly sync"],
    ["fileName", "voice-note.ogg"],
    ["levels", [0.1, 0.2]],
    ["audio", [0, 0]],
  ])("rejects a summary with %s", (key, value) => {
    expect(parseIncidentSummary({ ...example, [key]: value })).toEqual({
      ok: false,
      error: `unknown field: ${key}`,
    });
  });

  it.each([
    ["startedAt", "2026-11-20 14:03"],
    ["dissonance", { peak: 101, mean: 2 }],
    ["stepsDone", [1, 1]],
    ["stepsDone", [5]],
    ["model", { id: "Model/../x", version: "1.0.0" }],
    ["transitions", [{ from: "idle", to: "listening", at: 5 }]],
    ["secondsInState", { idle: 0 }],
    ["note", "Call me back at +1 555 0100"],
  ])("rejects an invalid %s", (key, value) => {
    expect(parseIncidentSummary({ ...example, [key]: value })).toEqual({
      ok: false,
      error: `invalid field: ${key}`,
    });
  });
});
