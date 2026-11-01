import { defineConfig } from "@playwright/test";
import { FAKE_AUDIO_FILE } from "./e2e/fake-audio.ts";

const PORT = 4317;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  reporter: "list",
  globalSetup: "./e2e/fake-audio.ts",
  // Production build, served by vite preview on the loopback interface only.
  webServer: {
    command: `pnpm exec vite build --outDir dist/e2e --emptyOutDir && pnpm exec vite preview --outDir dist/e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    browserName: "chromium",
    headless: true,
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${FAKE_AUDIO_FILE}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
});
