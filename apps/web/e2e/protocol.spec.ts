/** exorcism-protocol task 4.1: Possession → all steps → Exorcised → copy and download. */
import { readFile } from "node:fs/promises";
import { parseIncidentSummary } from "@doppelganger/contracts";
import { expect, test } from "@playwright/test";

const STEPS = [
  "Don't approve anything on this call",
  "Ask something only the real person would know",
  "Hang up and call back",
  "Tell your security team",
];

test("the protocol leads from Possession to Exorcised and produces a clean summary", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./?test-state=possession");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Doppelgänger detected");
  await page.getByRole("button", { name: "Start the protocol" }).click();

  const list = page.getByRole("list").filter({ has: page.getByRole("checkbox") });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  // The first unchecked step gets focus; tick them with the keyboard, in a mixed order.
  const order = [2, 0, 3, 1];
  for (const [n, index] of order.entries()) {
    const box = page.getByRole("checkbox", { name: STEPS[index] ?? "" });
    await box.focus();
    await page.keyboard.press("Space");
    if (n === order.length - 1) break; // the last tick completes the protocol
    await expect(box).toBeChecked();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Doppelgänger detected");
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Protocol completed");
  await expect(page.getByText(/^Protocol completed at \d{2}:\d{2}$/)).toBeVisible();
  // Collapsed in Exorcised, with a toggle to expand.
  await expect(page.getByRole("checkbox", { name: STEPS[0] ?? "" })).toBeHidden();
  await page.getByRole("button", { name: "Show the steps" }).click();
  for (const step of STEPS) await expect(page.getByRole("checkbox", { name: step })).toBeChecked();

  await page.getByRole("button", { name: "Copy summary" }).click();
  await expect(page.getByText("Summary copied.")).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split("\n")[0]).toBe("Doppelgänger incident summary");
  expect(text).toContain("Protocol steps done: 1, 2, 3, 4");
  expect(text).toContain("It is not proof.");
  expect(text).not.toMatch(/https?:\/\//);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download summary" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^doppelganger-incident-[0-9T-]+\.json$/);
  const json = JSON.parse(await readFile(await download.path(), "utf8")) as unknown;
  const parsed = parseIncidentSummary(json);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.summary.stepsDone).toEqual([1, 2, 3, 4]);
});

test("copy falls back to a selected read-only text box when the clipboard is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await page.goto("./?test-state=possession");
  await page.getByRole("button", { name: "Copy summary" }).click();
  const box = page.getByLabel("Press Ctrl+C to copy");
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("readonly", "");
  await expect(box).toBeFocused();
});

test("the code word reminder is saved, shown in step 2, and deleted", async ({ page }) => {
  await page.goto("./?test-state=possession");
  await page.getByText("Code word reminder").click();
  await page.getByLabel("Hint (up to 80 characters)").fill("the song from the team party");
  await page.getByRole("button", { name: "Save hint" }).click();
  await expect(page.getByText("Your reminder: the song from the team party")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Your reminder: the song from the team party")).toBeVisible();
  await page.getByText("Code word reminder").click();
  await page.getByRole("button", { name: "Delete hint" }).click();
  await expect(page.getByText(/^Your reminder:/)).toBeHidden();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
