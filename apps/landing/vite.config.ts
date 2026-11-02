/// <reference types="vitest/config" />
/**
 * Vite build for the landing page (served at <base>). The `evaluation` plugin renders the
 * newest committed evaluation report into the Limits section at build time (design P38).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { newestReport, renderEvaluation } from "./src/evaluation.ts";

const REPORTS = fileURLToPath(new URL("../../packages/model-lab/reports/", import.meta.url));
const MARKER = "<!-- evaluation -->";

/** `[folder, parsed results.json]` for every dated report folder. */
function readReports(dir: string): [string, unknown][] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "results.json")))
    .map((entry): [string, unknown] => {
      try {
        return [
          entry.name,
          JSON.parse(readFileSync(join(dir, entry.name, "results.json"), "utf8")),
        ];
      } catch {
        return [entry.name, null];
      }
    });
}

function evaluation(dir = REPORTS): Plugin {
  return {
    name: "evaluation",
    transformIndexHtml(html) {
      if (!html.includes(MARKER)) return html;
      const report = newestReport(readReports(dir));
      if (report === null) {
        this.warn?.("landing: no evaluation report found; the Limits section shows no numbers");
      }
      return html.replace(MARKER, renderEvaluation(report));
    },
  };
}

export default defineConfig({
  plugins: [evaluation()],
  build: { target: "es2022", sourcemap: false, assetsInlineLimit: 0 },
  test: { include: ["src/**/*.test.ts"] },
});
