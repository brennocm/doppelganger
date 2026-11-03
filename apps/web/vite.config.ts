/// <reference types="vitest/config" />
/**
 * Vite build for the detector app (served at <base>app/). The `self-hosted-assets` plugin
 * copies ONNX Runtime Web's WASM files into `ort/` (never a CDN; tech steering) and emits
 * the service worker with its precache list (audio-capture design, P25).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultClientConditions, defineConfig, type Plugin } from "vite";
import { voicedWav } from "./e2e/fake-audio.ts";

const ORT_DIST = fileURLToPath(new URL("./node_modules/onnxruntime-web/dist/", import.meta.url));
export const ORT_FILES = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"] as const;
const SW_SOURCE = fileURLToPath(new URL("./src/features/offline/sw-template.js", import.meta.url));
const PHOSPHOR = fileURLToPath(
  new URL("./node_modules/@phosphor-icons/core/assets/regular/", import.meta.url),
);

/**
 * Test-only replay signals (audio-capture P47): generated tones, not voices, emitted only by
 * `vite build --mode e2e` together with their own clips.json. The labels exist to exercise
 * both session labels; they say nothing about the signals.
 */
export const E2E_REPLAY_CLIPS = [
  { id: "test-a", file: "test-signal-a.wav", label: "genuine", title: "Test signal A", f0: 120 },
  { id: "test-b", file: "test-signal-b.wav", label: "synthetic", title: "Test signal B", f0: 180 },
] as const;
const E2E_REPLAY_SECONDS = 15;

function e2eReplayAssets(): Record<string, string | Uint8Array> {
  const clips = E2E_REPLAY_CLIPS.map(({ f0: _f0, ...clip }) => ({
    ...clip,
    seconds: E2E_REPLAY_SECONDS,
  }));
  const assets: Record<string, string | Uint8Array> = {
    "replay/clips.json": `${JSON.stringify({ clips }, null, 2)}\n`,
  };
  for (const clip of E2E_REPLAY_CLIPS)
    assets[`replay/${clip.file}`] = voicedWav(E2E_REPLAY_SECONDS, 16000, clip.f0);
  return assets;
}

function selfHostedAssets(): Plugin {
  let base = "/";
  let publicDir = "";
  let mode = "production";
  return {
    name: "self-hosted-assets",
    // Inline Phosphor icons (MIT) for <!--icon:name--> markers: no icon font, no requests.
    transformIndexHtml(html) {
      return html.replace(/<!--icon:([a-z-]+)-->/g, (_, name: string) =>
        readFileSync(`${PHOSPHOR}${name}.svg`, "utf8")
          .trim()
          .replace("<svg ", '<svg class="icon" aria-hidden="true" focusable="false" '),
      );
    },
    configResolved(config) {
      base = config.base;
      publicDir = config.publicDir;
      mode = config.mode;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
        const file = ORT_FILES.find((name) => path === `${base}ort/${name}`);
        if (file === undefined) return next();
        res.setHeader(
          "content-type",
          file.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        res.end(readFileSync(ORT_DIST + file));
      });
    },
    generateBundle(_options, bundle) {
      const e2eAssets = mode === "e2e" ? e2eReplayAssets() : {};
      for (const [fileName, source] of Object.entries(e2eAssets))
        this.emitFile({ type: "asset", fileName, source });
      for (const name of ORT_FILES) {
        this.emitFile({
          type: "asset",
          fileName: `ort/${name}`,
          source: readFileSync(ORT_DIST + name),
        });
      }
      // Precache: every emitted file, the public/ files (models, replay clips) and ORT.
      const fromPublic = publicDir
        ? readdirSync(publicDir, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) =>
              relative(publicDir, join(entry.parentPath, entry.name)).split(sep).join("/"),
            )
        : [];
      const files = [
        ...new Set([
          ...Object.keys(bundle),
          ...Object.keys(e2eAssets),
          ...fromPublic,
          ...ORT_FILES.map((n) => `ort/${n}`),
        ]),
      ]
        .filter((f) => f !== "sw.js" && !f.endsWith(".map"))
        .sort();
      const urls = ["./", ...files.map((f) => `./${f}`)];
      const version = createHash("sha256").update(urls.join("\n")).digest("hex").slice(0, 16);
      const source = readFileSync(SW_SOURCE, "utf8")
        .replace("__PRECACHE__", JSON.stringify(urls))
        .replace("__VERSION__", JSON.stringify(version));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

const PACKAGE = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  plugins: [selfHostedAssets()],
  define: { __APP_VERSION__: JSON.stringify(PACKAGE.version) },
  // ORT's "extern wasm" build loads its .mjs/.wasm from wasmPaths (our ort/ copy) instead
  // of bundling a second 15 MB copy through import.meta.url.
  resolve: { conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions] },
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: false, assetsInlineLimit: 0 },
  // Playwright owns e2e/; Vitest runs only the unit and property tests.
  test: { include: ["src/**/*.test.ts"] },
});
