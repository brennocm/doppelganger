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

const ORT_DIST = fileURLToPath(new URL("./node_modules/onnxruntime-web/dist/", import.meta.url));
export const ORT_FILES = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"] as const;
const SW_SOURCE = fileURLToPath(new URL("./src/features/offline/sw-template.js", import.meta.url));

function selfHostedAssets(): Plugin {
  let base = "/";
  let publicDir = "";
  return {
    name: "self-hosted-assets",
    configResolved(config) {
      base = config.base;
      publicDir = config.publicDir;
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
      const files = [...Object.keys(bundle), ...fromPublic, ...ORT_FILES.map((n) => `ort/${n}`)]
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

export default defineConfig({
  plugins: [selfHostedAssets()],
  // ORT's "extern wasm" build loads its .mjs/.wasm from wasmPaths (our ort/ copy) instead
  // of bundling a second 15 MB copy through import.meta.url.
  resolve: { conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions] },
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: false, assetsInlineLimit: 0 },
  // Playwright owns e2e/; Vitest runs only the unit and property tests.
  test: { include: ["src/**/*.test.ts"] },
});
