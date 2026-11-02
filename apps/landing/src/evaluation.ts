/**
 * Build-time rendering of the evaluation numbers in the Limits section (landing-page
 * Requirement 5.2, design P38). Pure: no DOM, no I/O. The Vite plugin in vite.config.ts
 * reads the newest report and calls `renderEvaluation`.
 */

/** The part of `results.json` (detection-model Requirement 2.4) the page shows. */
export interface EvaluationRow {
  dataset: string;
  condition: string;
  auc: number | null;
  eer: number | null;
  falseAlarmRateSmoothed?: number | null;
}

export interface EvaluationCandidate {
  candidate: string;
  results: EvaluationRow[];
}

export interface EvaluationReport {
  date: string;
  label?: string;
  candidates: EvaluationCandidate[];
}

export const DRY_RUN_MARK = "synthetic dry run";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Escape text for HTML element content and attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** ROC AUC with 3 decimals; "n/a" for a missing value. */
export function formatAuc(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

/** A rate in [0, 1] as a percentage with 1 decimal; "n/a" for a missing value. */
export function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)} %`
    : "n/a";
}

/** True when a parsed JSON value has the fields the page needs. */
export function isReport(value: unknown): value is EvaluationReport {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  const date = r["date"];
  const list = r["candidates"];
  return (
    typeof date === "string" &&
    DATE.test(date) &&
    Array.isArray(list) &&
    list.every((c: unknown) => {
      if (typeof c !== "object" || c === null) return false;
      const entry = c as Record<string, unknown>;
      return typeof entry["candidate"] === "string" && Array.isArray(entry["results"]);
    })
  );
}

/**
 * The newest usable report among `[folder name, parsed JSON]` pairs: folders named by
 * date, newest first; dry runs and malformed files are skipped.
 */
export function newestReport(entries: [string, unknown][]): EvaluationReport | null {
  const usable = entries
    .filter(([folder, json]) => DATE.test(folder) && isReport(json))
    .filter(([, json]) => !((json as EvaluationReport).label ?? "").includes(DRY_RUN_MARK))
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
  const first = usable[0];
  return first === undefined ? null : (first[1] as EvaluationReport);
}

/** HTML for the evaluation part of the Limits section. */
export function renderEvaluation(report: EvaluationReport | null): string {
  if (report === null || report.candidates.length === 0) {
    return '<p class="evaluation-none">No evaluation has been published yet, so this page shows no numbers.</p>';
  }
  const tables = report.candidates.map((c) => {
    const rows = c.results
      .map(
        (r) =>
          `<tr><th scope="row">${escapeHtml(r.dataset)}</th><td>${escapeHtml(r.condition)}</td>` +
          `<td class="num">${formatAuc(r.auc)}</td><td class="num">${formatPercent(r.eer)}</td>` +
          `<td class="num">${formatPercent(r.falseAlarmRateSmoothed)}</td></tr>`,
      )
      .join("");
    return (
      `<div class="table-wrap" role="region" tabindex="0" aria-label="Evaluation of ${escapeHtml(c.candidate)}"><table class="evaluation"><caption><span class="mono">${escapeHtml(c.candidate)}</span></caption>` +
      '<thead><tr><th scope="col">Dataset</th><th scope="col">Condition</th>' +
      '<th scope="col">ROC AUC</th><th scope="col">EER</th>' +
      '<th scope="col">False alarms on real voices, after smoothing</th></tr></thead>' +
      `<tbody>${rows}</tbody></table></div>`
    );
  });
  return (
    `<p class="evaluation-date">From the evaluation run of <time datetime="${escapeHtml(report.date)}">${escapeHtml(report.date)}</time> (<code>mise run model:eval</code>).</p>` +
    tables.join("")
  );
}
