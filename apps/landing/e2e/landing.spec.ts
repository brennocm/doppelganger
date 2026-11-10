/**
 * Landing page end to end (landing-page tasks 2.3 and 3.1, design P46).
 *
 * `real` serves the real content. `capture` serves a test content with the capture slot
 * filled in from placeholder media. Every external request is intercepted and answered
 * locally, so the tests never touch the network.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { CAPTURE_PORT, REAL_PORT } from "../playwright.config.ts";

const REAL = `http://127.0.0.1:${REAL_PORT}`;
const CAPTURE = `http://127.0.0.1:${CAPTURE_PORT}`;
const WIDTHS = [375, 1440] as const;
const MOTIONS = ["no-preference", "reduce"] as const;
const BUDGET_BYTES = 500 * 1024;

/** Record every request origin; answer anything off-origin locally instead of the network. */
async function recordOrigins(page: Page, self: string): Promise<Set<string>> {
  const origins = new Set<string>();
  page.on("request", (request) => origins.add(new URL(request.url()).origin));
  await page.route(
    (url) => url.origin !== self,
    (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html>" }),
  );
  return origins;
}

async function setup(page: Page, width: number, motion: (typeof MOTIONS)[number]) {
  await page.emulateMedia({ reducedMotion: motion });
  await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
}

for (const [name, base] of [
  ["real", REAL],
  ["capture", CAPTURE],
] as const) {
  for (const width of WIDTHS) {
    for (const motion of MOTIONS) {
      // Feature: landing-page, Property 1: No third-party requests
      test(`${name}: only the page's own origin is requested, ${width}px, ${motion}`, async ({
        page,
      }) => {
        const origins = await recordOrigins(page, base);
        await setup(page, width, motion);
        await page.goto(`${base}/`, { waitUntil: "networkidle" });
        await page.locator("footer").scrollIntoViewIfNeeded();
        await page.waitForLoadState("networkidle");
        expect([...origins]).toEqual([base]);
        await expect(page.locator("iframe")).toHaveCount(0);
      });
    }

    test(`${name}: no axe-core violations and no horizontal scrolling at ${width}px`, async ({
      page,
    }) => {
      await setup(page, width, "no-preference");
      await page.goto(`${base}/`, { waitUntil: "networkidle" });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test(`${name}: the policy allows no other origin and the write-up is linked`, async ({
    page,
  }) => {
    await page.goto(`${base}/`);
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain("frame-src");
    await expect(page.getByRole("link", { name: "The write-up" })).toHaveAttribute(
      "href",
      /docs\/KIRO\.md$/,
    );
  });

  test(`${name}: the page weighs under 500 KB (HTML, scripts, styles, images)`, async ({
    page,
  }) => {
    let total = 0;
    const sizes: Record<string, number> = {};
    page.on("response", async (response) => {
      if (new URL(response.url()).origin !== base) return;
      const size = (await response.body().catch(() => Buffer.alloc(0))).length;
      sizes[new URL(response.url()).pathname] = size;
      total += size;
    });
    await setup(page, 1440, "reduce"); // the optional looping capture is not loaded
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    expect(Object.keys(sizes).some((path) => path.endsWith(".mp4"))).toBe(false);
    expect(total, JSON.stringify(sizes)).toBeLessThan(BUDGET_BYTES);
  });
}

test("real: the hero shows the capture poster", async ({ page }) => {
  await page.goto(`${REAL}/`, { waitUntil: "networkidle" });
  await expect(page.locator("figure.capture img")).toBeVisible();
});

test("capture: the clip loads lazily, and not at all under reduced motion", async ({ page }) => {
  const clip: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4")) clip.push(request.url());
  });
  await setup(page, 1440, "reduce");
  await page.goto(`${CAPTURE}/`, { waitUntil: "networkidle" });
  await page.locator("figure.capture").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await expect(page.locator("figure.capture video")).toHaveCount(0);
  await expect(page.locator("figure.capture img")).toBeVisible();
  expect(clip).toEqual([]);

  await setup(page, 375, "no-preference");
  await page.goto(`${CAPTURE}/`, { waitUntil: "networkidle" });
  await expect(page.locator("figure.capture video")).toHaveAttribute("preload", "none");
  await expect(page.locator("figure.capture video")).toHaveJSProperty("muted", true);
  await expect(page.locator("figure.capture video")).toHaveJSProperty("loop", true);
});
