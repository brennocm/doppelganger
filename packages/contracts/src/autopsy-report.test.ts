import { describe, expect, it } from "vitest";
import schemaJson from "../schemas/autopsy-report.schema.json" with { type: "json" };
import { AUTOPSY_FIELDS, parseAutopsyReport, VERDICT_REASONS } from "./index.ts";

const schema = schemaJson as {
  required: string[];
  properties: Record<string, { enum?: string[] }>;
};

const report = {
  modelId: "ci-synthetic-linear",
  modelVersion: "0.1.0",
  durationS: 8,
  windows: [{ index: 0, startS: 0, endS: 4.0375, voiced: true, score: 0.5, smoothed: 0.5 }],
  states: [{ from: 0, to: 4.0375, state: "unease" }],
  verdict: "inconclusive",
  verdictReason: "Dissonance rose to Unease but never reached Possession",
};

describe("parseAutopsyReport", () => {
  it("accepts a valid report and mirrors the schema", () => {
    expect(parseAutopsyReport(report).ok).toBe(true);
    expect(Object.keys(AUTOPSY_FIELDS).sort()).toEqual(Object.keys(schema.properties).sort());
    expect([...VERDICT_REASONS]).toEqual(schema.properties["verdictReason"]?.enum);
  });

  it.each([
    ["samples", [0.1, 0.2]],
    ["fileName", "voice-note.ogg"],
  ])("rejects a report with %s", (key, value) => {
    expect(parseAutopsyReport({ ...report, [key]: value })).toEqual({
      ok: false,
      error: `unknown field: ${key}`,
    });
  });

  it("rejects a window carrying samples", () => {
    const windows = [{ ...report.windows[0], samples: [0.1] }];
    expect(parseAutopsyReport({ ...report, windows })).toEqual({
      ok: false,
      error: "invalid field: windows",
    });
  });
});
