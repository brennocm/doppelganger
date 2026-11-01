/**
 * Autopsy in the browser with synthetic in-memory audio. The synthetic CI model detects
 * nothing, so these tests check the flow (intake, progress, report, playback, download),
 * not the verdict. Verdicts on real clips wait for the replay fixtures (task 5.1).
 */
import { readFile } from "node:fs/promises";
import { parseAutopsyReport } from "@doppelganger/contracts";
import { expect, test } from "@playwright/test";
import { voicedWav } from "./fake-audio.ts";

test("a recording is analyzed in the worker and reported without audio", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#model-id")).toHaveText(/^ci-synthetic-linear /);
  await expect(page.getByText(/^This browser can read: .*WAV/)).toBeVisible();
  await page
    .locator("#autopsy-file")
    .setInputFiles({ name: "voice-note.wav", mimeType: "audio/wav", buffer: voicedWav(10) });
  await expect(page.getByText("Analysis complete.")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#autopsy-verdict")).toHaveText(
    /^(Likely human|Inconclusive|Likely synthetic)$/,
  );
  await expect(page.locator("#autopsy-model")).toHaveText("ci-synthetic-linear 0.1.0");
  await expect(page.getByText("It is not proof.", { exact: false })).toBeVisible();

  // Keyboard on the timeline moves the playhead one window.
  const timeline = page.getByRole("slider", { name: /Recording timeline/ });
  await timeline.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(timeline).toHaveAttribute("aria-valuenow", "2");
  expect(await page.locator("#autopsy-audio").getAttribute("src")).toMatch(/^blob:/);
  await expect(page.locator("#autopsy")).toHaveScreenshot("autopsy-report.png", {
    maxDiffPixelRatio: 0.01,
  });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download report" }).click(),
  ]);
  const text = await readFile(await download.path(), "utf8");
  const parsed = parseAutopsyReport(JSON.parse(text) as unknown);
  expect(parsed.ok).toBe(true);
  expect(text).not.toContain("voice-note");
  if (parsed.ok)
    expect(parsed.report.windows.length).toBe(Math.floor((10 * 16000 - 64600) / 16000) + 1);

  await page.getByRole("button", { name: "Close report" }).click();
  await expect(page.getByText("Report closed. The file was dropped.")).toBeVisible();
  expect(await page.locator("#autopsy-audio").getAttribute("src")).toBeNull();
});

test("files over 20 MB and unreadable files are refused with the design's messages", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#model-id")).toHaveText(/^ci-synthetic-linear /);
  await page.locator("#autopsy-file").setInputFiles({
    name: "big.wav",
    mimeType: "audio/wav",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByText("This file is over 20 MB. Trim it to under 5 minutes and try again."),
  ).toBeVisible();
  await page.locator("#autopsy-file").setInputFiles({
    name: "noise.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("not audio at all"),
  });
  await expect(
    page.getByText("This browser can't read this file. Convert it to WAV and drop it again."),
  ).toBeVisible();
});

test("an analysis can be cancelled", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#model-id")).toHaveText(/^ci-synthetic-linear /);
  await page
    .locator("#autopsy-file")
    .setInputFiles({ name: "long.wav", mimeType: "audio/wav", buffer: voicedWav(240, 16000) });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Analysis cancelled. Nothing was kept.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("#autopsy-report")).toBeHidden();
});
