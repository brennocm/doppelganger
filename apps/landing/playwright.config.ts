import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

/**
 * Two production builds of the landing page, served on the loopback interface only
 * (landing-page design P46): the real content, and a test content with the capture slot
 * filled in from placeholder media.
 */
export const REAL_PORT = 4311;
export const CAPTURE_PORT = 4312;

const FIXTURES = fileURLToPath(new URL("./e2e/fixtures/", import.meta.url));

function server(outDir: string, port: number, env = "") {
  return {
    command:
      `${env} pnpm exec vite build --outDir ${outDir} --emptyOutDir && ` +
      `pnpm exec vite preview --outDir ${outDir} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  };
}

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  reporter: "list",
  webServer: [
    server("dist/e2e-real", REAL_PORT),
    server(
      "dist/e2e-capture",
      CAPTURE_PORT,
      `LANDING_CONTENT=${FIXTURES}content.test.json LANDING_PUBLIC=${FIXTURES}public`,
    ),
  ],
  use: { browserName: "chromium", headless: true },
});
