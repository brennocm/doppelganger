/// <reference types="vitest/config" />
/**
 * Vite build for the landing page (served at <base>). The `evaluation` plugin renders the
 * newest committed evaluation report into the Limits section at build time (design P38).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import {
  BASE_CSP,
  type LandingContent,
  mediaFiles,
  parseContent,
  renderCapture,
  renderWriteUp,
} from "./src/content.ts";
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

const ROOT = fileURLToPath(new URL("./", import.meta.url));
// Tests build with their own content and media (design P46); production uses the defaults.
const CONTENT = process.env["LANDING_CONTENT"] ?? join(ROOT, "content.json");
const PUBLIC = process.env["LANDING_PUBLIC"] ?? join(ROOT, "public");

/** Render content.json into the page; a missing media file fails the build. */
function content(file = CONTENT, publicDir = PUBLIC): Plugin {
  const parsed: LandingContent = parseContent(JSON.parse(readFileSync(file, "utf8")));
  for (const media of mediaFiles(parsed)) {
    if (!existsSync(join(publicDir, media))) {
      throw new Error(`landing: ${media} is named in content.json but not found in ${publicDir}`);
    }
  }
  return {
    name: "content",
    transformIndexHtml: {
      // After Vite's own asset handling, so the URLs stay as written (relative to the page).
      order: "post",
      handler(html) {
        if (!html.includes(BASE_CSP)) throw new Error("landing: the base CSP is missing");
        return html
          .replace("<!-- capture -->", renderCapture(parsed))
          .replace("<!-- writeup -->", renderWriteUp(parsed));
      },
    },
  };
}

export default defineConfig({
  plugins: [evaluation(), content()],
  publicDir: PUBLIC,
  build: { target: "es2022", sourcemap: false, assetsInlineLimit: 0 },
  test: { include: ["src/**/*.test.ts"] },
});
