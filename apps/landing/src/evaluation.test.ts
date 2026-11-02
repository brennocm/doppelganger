import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type EvaluationReport,
  escapeHtml,
  formatAuc,
  formatPercent,
  newestReport,
  renderEvaluation,
} from "./evaluation.ts";

const name = fc.stringMatching(/^[a-z0-9][a-z0-9.-]{0,20}$/);
const rate = fc.oneof(
  fc.constant(null),
  fc.constantFrom(0, 1, 0.05, 0.85),
  fc.double({ min: 0, max: 1, noNaN: true }),
);
const date = fc
  .date({ min: new Date("2026-01-01"), max: new Date("2027-12-31"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));
const report: fc.Arbitrary<EvaluationReport> = fc.record({
  date,
  candidates: fc.array(
    fc.record({
      candidate: name,
      results: fc.array(
        fc.record({
          dataset: name,
          condition: fc.constantFrom("clean", "opus-16k", "opus-32k", "band-8k", "noise-10db"),
          auc: rate,
          eer: rate,
          falseAlarmRateSmoothed: rate,
        }),
        { maxLength: 6 },
      ),
    }),
    { minLength: 1, maxLength: 3 },
  ),
});

/** Every numeric cell of the rendered tables, in order. */
function cells(html: string): string[] {
  return [...html.matchAll(/<td class="num">([^<]*)<\/td>/g)].map((m) => m[1] ?? "");
}

describe("renderEvaluation", () => {
  // Feature: landing-page, Property 2: Numbers come from the report
  it("renders exactly the report's numbers, in order, and no others", () => {
    fc.assert(
      fc.property(report, (r) => {
        const html = renderEvaluation(r);
        const expected = r.candidates.flatMap((c) =>
          c.results.flatMap((row) => [
            formatAuc(row.auc),
            formatPercent(row.eer),
            formatPercent(row.falseAlarmRateSmoothed),
          ]),
        );
        expect(cells(html)).toEqual(expected);
        // Outside the numeric cells, the only digits are the date and the model, dataset and
        // condition names taken from the report.
        const names = r.candidates.flatMap((c) => [
          c.candidate,
          ...c.results.flatMap((row) => [row.dataset, row.condition]),
        ]);
        let rest = html
          .replaceAll(/<td class="num">[^<]*<\/td>/g, "")
          .replaceAll(/<[^>]*>/g, " ")
          .replaceAll(r.date, "");
        for (const n of names.sort((a, b) => b.length - a.length)) {
          rest = rest.replaceAll(escapeHtml(n), "");
        }
        expect(rest).not.toMatch(/\d/);
      }),
      { numRuns: 200 },
    );
  });

  it("shows no numbers without a report", () => {
    const html = renderEvaluation(null);
    expect(html).toContain("No evaluation has been published yet");
    expect(html).not.toMatch(/\d/);
    expect(renderEvaluation({ date: "2026-11-02", candidates: [] })).not.toMatch(/\d/);
  });

  it("formats values and missing values", () => {
    expect(formatAuc(0.8567)).toBe("0.857");
    expect(formatPercent(0.0449)).toBe("4.5 %");
    expect(formatAuc(null)).toBe("n/a");
    expect(formatPercent(undefined)).toBe("n/a");
    expect(formatAuc(Number.NaN)).toBe("n/a");
  });

  it("escapes strings that come from the report", () => {
    const html = renderEvaluation({
      date: "2026-11-02",
      candidates: [{ candidate: "<img src=x>", results: [] }],
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x&gt;");
  });
});

describe("newestReport", () => {
  const ok = (d: string, label = "") => ({ date: d, label, candidates: [] });

  it("picks the newest dated folder", () => {
    const picked = newestReport([
      ["2026-11-01", ok("2026-11-01")],
      ["2026-11-03", ok("2026-11-03")],
      ["2026-11-02", ok("2026-11-02")],
    ]);
    expect(picked?.date).toBe("2026-11-03");
  });

  it("skips dry runs, malformed files and undated folders", () => {
    expect(
      newestReport([
        ["2026-11-05", ok("2026-11-05", "synthetic dry run, not a measurement")],
        ["2026-11-04", null],
        ["latest", ok("2026-11-09")],
        ["2026-11-03", { date: "2026-11-03" }],
        ["2026-11-01", ok("2026-11-01")],
      ])?.date,
    ).toBe("2026-11-01");
    expect(newestReport([])).toBeNull();
  });
});
