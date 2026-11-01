/**
 * Every haunting state at 375 px and 1440 px, with full and reduced motion
 * (haunted-ui task 6.1), plus an axe-core check per state.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const STATES = ["idle", "listening", "mask", "unease", "possession", "exorcised"] as const;
const HEADLINES: Record<(typeof STATES)[number], string> = {
  idle: "Not listening",
  listening: "Waiting for a voice",
  mask: "Sounds human",
  unease: "Something doesn't add up",
  possession: "Doppelgänger detected",
  exorcised: "Protocol completed",
};
const WIDTHS = [375, 1440] as const;
const MOTIONS = ["no-preference", "reduce"] as const;

for (const state of STATES) {
  for (const width of WIDTHS) {
    for (const motion of MOTIONS) {
      test(`${state} at ${width}px, motion ${motion}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: motion });
        await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
        await page.goto(`./?test-state=${state}`);
        await expect(page.locator("#app")).toHaveAttribute("data-state", state);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINES[state]);
        await expect(page.locator("#model-id")).toHaveText(/^ci-synthetic-linear /);
        await expect(page.locator("#app")).toHaveAttribute(
          "data-motion",
          motion === "reduce" ? "reduced" : "full",
        );
        // No horizontal scrolling at any width (Requirement 6.1).
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await expect(page).toHaveScreenshot(`${state}-${width}-${motion}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  }

  test(`${state} has no axe-core violations`, async ({ page }) => {
    await page.goto(`./?test-state=${state}`);
    await expect(page.locator("#app")).toHaveAttribute("data-state", state);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      ),
    ).toEqual([]);
  });
}

test("200% zoom at 1440 px has no horizontal scrolling", async ({ page }) => {
  // 1440 px at 200% zoom lays out like a 720 px viewport.
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto("./?test-state=possession");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("keyboard reaches the primary action with a visible focus ring", async ({ page }) => {
  await page.goto("./?test-state=possession");
  const button = page.getByRole("button", { name: "Start the protocol" });
  await expect(button).toBeVisible();
  for (let i = 0; i < 10 && !(await button.evaluate((b) => b === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(button).toBeFocused();
  const outline = await button.evaluate((b) => getComputedStyle(b).outlineStyle);
  expect(outline).toBe("solid");
});
