import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 180_000,
  reporter: "list",
  use: { browserName: "chromium", headless: true },
});
