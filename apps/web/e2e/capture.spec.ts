import { expect, type Page, test } from "@playwright/test";

function trackExternal(page: Page, origin: string): string[] {
  const external: string[] = [];
  // The context sees page, worker and service-worker requests alike.
  page.context().on("request", (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith("data:"))
      external.push(request.url());
  });
  return external;
}

async function expectScored(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Use microphone" }).click();
  await expect(page.getByText("Listening to the microphone")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop listening" })).toBeVisible();
  // One window is ~4 s of audio; then the score becomes a number from 0 to 100.
  await expect(page.locator("#score")).toHaveText(/^\d{1,3}$/, { timeout: 30_000 });
  await expect(page.locator("#app")).not.toHaveAttribute("data-state", "idle");
}

test("mic path: privacy notice first, then the synthetic model scores fake audio", async ({
  page,
  baseURL,
}) => {
  const external = trackExternal(page, new URL(baseURL ?? "").origin);
  await page.goto("./");
  await expect(
    page.getByText("Audio is analyzed on this device. It is never recorded and never uploaded."),
  ).toBeVisible();
  await expect(page.locator("#model-id")).toHaveText(/^ci-synthetic-linear /);
  await expect(page.getByText("Test model: it detects nothing.", { exact: false })).toBeVisible();
  await expect(page.getByText("No replay clips are bundled yet.")).toBeVisible();
  await expectScored(page);
  await page.getByRole("button", { name: "Stop listening" }).click();
  await expect(page.getByRole("heading", { name: "Not listening" })).toBeVisible();
  expect(external).toEqual([]);
});

test("offline: after one visit the app reloads and scores without a network", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator("#model-id")).toHaveText(/^ci-synthetic-linear /);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#model-id")).toHaveText(/^ci-synthetic-linear /, { timeout: 20_000 });
  await expectScored(page);
});
