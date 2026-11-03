/**
 * Replay path, offline replay and Autopsy of the replay fixtures (audio-capture 5.2 and
 * 6.1, autopsy-mode 5.1). Until detection-model 7.2 the end-to-end build carries the P47
 * test signals: generated tones, not voices. These tests assert behaviour only (labels,
 * states, a numeric score, no network after load), never a verdict, so they keep passing
 * when the real clips and the Light_Model replace the test signals and the CI model.
 */
import { readFileSync } from "node:fs";
import { parseAutopsyReport } from "@doppelganger/contracts";
import { expect, type Page, test } from "@playwright/test";

interface Clip {
  id: string;
  file: string;
  label: "genuine" | "synthetic";
  title: string;
  seconds: number;
}

const LABELS = { genuine: "Replay: genuine", synthetic: "Replay: synthetic" } as const;
/** "<id> <version>" once the worker reports ready; any model, so the real one passes too. */
const MODEL_READY = /^\S+ \d+\.\d+\.\d+$/;

async function clipsOf(page: Page): Promise<Clip[]> {
  const response = await page.request.get("replay/clips.json");
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { clips: Clip[] }).clips;
}

function trackExternal(page: Page, origin: string): string[] {
  const external: string[] = [];
  page.context().on("request", (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith("data:"))
      external.push(request.url());
  });
  return external;
}

async function replayAndScore(page: Page, clip: Clip): Promise<void> {
  await page.getByRole("button", { name: `${clip.title} (${LABELS[clip.label]})` }).click();
  await expect(page.locator("#session-label")).toHaveText(LABELS[clip.label]);
  await expect(page.getByText("Listening to a replay")).toBeVisible();
  // One window is ~4 s of audio; then the score becomes a number from 0 to 100.
  await expect(page.locator("#score")).toHaveText(/^\d{1,3}$/, { timeout: 30_000 });
  await expect(page.locator("#app")).not.toHaveAttribute("data-state", "idle");
  await page.getByRole("button", { name: "Stop listening" }).click();
  await expect(page.locator("#session-label")).toBeHidden();
}

test("replay path: both clip labels are shown for the whole session and scored", async ({
  page,
  baseURL,
}) => {
  const external = trackExternal(page, new URL(baseURL ?? "").origin);
  await page.goto("./");
  await expect(page.locator("#model-id")).toHaveText(MODEL_READY);
  const clips = await clipsOf(page);
  expect(new Set(clips.map((c) => c.label))).toEqual(new Set(["genuine", "synthetic"]));
  await expect(page.locator("#no-clips")).toBeHidden();
  for (const clip of clips) await replayAndScore(page, clip);
  expect(external).toEqual([]);
});

test("offline: after one visit, replay detection runs with the network off", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  const [clip] = await clipsOf(page);
  if (clip === undefined) throw new Error("the end-to-end build has no replay clips");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#model-id")).toHaveText(MODEL_READY, { timeout: 20_000 });
  await replayAndScore(page, clip);
});

test.describe("the shipped clips index", () => {
  // Without a service worker, page.route sees the app's own fetch of clips.json.
  test.use({ serviceWorkers: "block" });

  test("an empty index says no clips are bundled and never shows the pending marker", async ({
    page,
  }) => {
    const shipped = readFileSync(new URL("../public/replay/clips.json", import.meta.url), "utf8");
    await page.route("**/replay/clips.json", (route) =>
      route.fulfill({ contentType: "application/json", body: shipped }),
    );
    await page.goto("./");
    const { clips } = JSON.parse(shipped) as { clips: unknown[] };
    if (clips.length === 0) {
      await expect(page.getByText("No replay clips are bundled yet.")).toBeVisible();
    } else {
      await expect(page.locator("#clips button")).toHaveCount(clips.length);
    }
    await expect(page.locator("body")).not.toContainText("PENDING-GATE");
  });
});

test("autopsy of each replay fixture gives a report with one of the three verdicts", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#model-id")).toHaveText(MODEL_READY);
  for (const clip of await clipsOf(page)) {
    const audio = await page.request.get(`replay/${clip.file}`);
    expect(audio.ok()).toBe(true);
    await page
      .locator("#autopsy-file")
      .setInputFiles({ name: clip.file, mimeType: "audio/wav", buffer: await audio.body() });
    await expect(page.getByText("Analysis complete.")).toBeVisible({ timeout: 30_000 });
    const verdict = await page.locator("#autopsy-verdict").textContent();
    expect(verdict).toMatch(/^(Likely human|Inconclusive|Likely synthetic)$/);
    // Recorded for the journal once the real clips replace the test signals.
    test.info().annotations.push({ type: "verdict", description: `${clip.id}: ${verdict}` });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download report" }).click(),
    ]);
    const parsed = parseAutopsyReport(
      JSON.parse(readFileSync(await download.path(), "utf8")) as unknown,
    );
    expect(parsed.ok).toBe(true);
    await page.getByRole("button", { name: "Close report" }).click();
    await expect(page.getByText("Report closed. The file was dropped.")).toBeVisible();
  }
});
