/**
 * Landing page end to end (landing-page tasks 2.3 and 3.1, design P46).
 *
 * `pending` serves the real content, where everything that waits for the gate is pending.
 * `facade` serves a test content with the video facade and the capture slot filled in from
 * placeholder media. Every external request is intercepted and answered locally, so the
 * tests never touch the network.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { FACADE_PORT, PENDING_PORT } from "../playwright.config.ts";

const PENDING = `http://127.0.0.1:${PENDING_PORT}`;
const FACADE = `http://127.0.0.1:${FACADE_PORT}`;
const EMBED_ORIGIN = "https://www.youtube-nocookie.com";
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

for (const width of WIDTHS) {
  for (const motion of MOTIONS) {
    // Feature: landing-page, Property 1: No third-party requests before consent
    test(`facade: only the page's own origin is requested before play, ${width}px, ${motion}`, async ({
      page,
    }) => {
      const origins = await recordOrigins(page, FACADE);
      await setup(page, width, motion);
      await page.goto(`${FACADE}/`, { waitUntil: "networkidle" });
      await page.locator("#video").scrollIntoViewIfNeeded();
      await page.waitForLoadState("networkidle");
      expect([...origins]).toEqual([FACADE]);

      // After consent, exactly one more origin is added: the privacy-enhanced player.
      // networkidle was already reached, so waiting for it again does not cover the iframe's
      // request: wait for that request itself.
      const embedRequest = page.waitForRequest((r) => new URL(r.url()).origin === EMBED_ORIGIN);
      await page.getByRole("button", { name: "Play the 3-minute video" }).click();
      const frame = page.locator("iframe.video-frame");
      await expect(frame).toHaveAttribute("src", `${EMBED_ORIGIN}/embed/aaaaaaaaaaa`);
      await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
      await expect(page.locator("button.video-facade")).toHaveCount(0);
      await embedRequest;
      await page.waitForLoadState("networkidle");
      expect([...origins].sort()).toEqual([EMBED_ORIGIN, FACADE].sort());
    });
  }

  test(`pending: no third-party origin and no embed, ${width}px`, async ({ page }) => {
    const origins = await recordOrigins(page, PENDING);
    await setup(page, width, "no-preference");
    await page.goto(`${PENDING}/`, { waitUntil: "networkidle" });
    expect([...origins]).toEqual([PENDING]);
    await expect(page.locator("iframe, button.video-facade, figure.capture")).toHaveCount(0);
    await expect(page.locator("#video")).toContainText("The 3-minute video is not published yet.");
    // Neutral states: the pending marker and any frame-src are absent.
    const html = await page.content();
    expect(html).not.toContain("PENDING");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).not.toContain("frame-src");
    await expect(page.getByText("The write-up")).toHaveCount(0);
  });
}

test("facade: the policy allows the privacy-enhanced player and nothing more", async ({ page }) => {
  await page.goto(`${FACADE}/`);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp?.endsWith(`; frame-src ${EMBED_ORIGIN}`)).toBe(true);
  expect(csp?.match(/frame-src/g)).toHaveLength(1);
  await expect(page.getByRole("link", { name: "The write-up" })).toHaveAttribute(
    "href",
    /docs\/KIRO\.md$/,
  );
});

test("facade: the capture loads lazily, and not at all under reduced motion", async ({ page }) => {
  const clip: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4")) clip.push(request.url());
  });
  await setup(page, 1440, "reduce");
  await page.goto(`${FACADE}/`, { waitUntil: "networkidle" });
  await page.locator("figure.capture").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await expect(page.locator("figure.capture video")).toHaveCount(0);
  await expect(page.locator("figure.capture img")).toBeVisible();
  expect(clip).toEqual([]);

  await setup(page, 375, "no-preference");
  await page.goto(`${FACADE}/`, { waitUntil: "networkidle" });
  await expect(page.locator("figure.capture video")).toHaveAttribute("preload", "none");
  await expect(page.locator("figure.capture video")).toHaveJSProperty("muted", true);
  await expect(page.locator("figure.capture video")).toHaveJSProperty("loop", true);
});

test("facade: a poster-less evil address in data-embed never becomes an iframe", async ({
  page,
}) => {
  await page.goto(`${FACADE}/`);
  await page.evaluate(() => {
    document
      .querySelector("button.video-facade")
      ?.setAttribute("data-embed", "https://evil.example/embed/aaaaaaaaaaa");
  });
  await page.getByRole("button", { name: "Play the 3-minute video" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
});

for (const [name, base] of [
  ["pending", PENDING],
  ["facade", FACADE],
] as const) {
  test(`${name}: the page weighs under 500 KB before the video (HTML, scripts, styles, images)`, async ({
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

  for (const width of WIDTHS) {
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
}
