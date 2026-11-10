import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { startServer } from "./server.ts";

const reports = fileURLToPath(new URL("../../reports", import.meta.url));

interface BenchResult {
  runtime: string;
  model: string;
  windows: number;
  p50: number;
  p95: number;
}

test("ONNX Runtime Web runs the model single-threaded and reports p50 and p95", async ({
  page,
}) => {
  const { server, origin } = await startServer();
  try {
    const external: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(origin)) external.push(request.url());
    });
    // BENCH_MODEL=<id> benchmarks apps/web/public/models/<id>.json instead of the CI model.
    const model = process.env["BENCH_MODEL"];
    const manifest =
      model === undefined ? "" : `&manifest=/models/${encodeURIComponent(model)}.json`;
    await page.goto(`${origin}/index.html?windows=50${manifest}`);
    await expect(page.locator("#status")).not.toHaveText("Running", { timeout: 120_000 });
    const error = await page.evaluate(() => (window as { benchError?: string }).benchError);
    expect(error).toBeUndefined();
    const result = (await page.evaluate(
      () => (window as { benchResult?: unknown }).benchResult,
    )) as BenchResult;
    expect(result.windows).toBe(50);
    expect(result.p50).toBeGreaterThan(0);
    expect(result.p95).toBeGreaterThanOrEqual(result.p50);
    expect(external).toEqual([]);
    // Git-ignored; pass it to `mise run model:eval -- --web-latency <file>`.
    const folder = join(reports, new Date().toISOString().slice(0, 10));
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "latency-web.json"), `${JSON.stringify(result, null, 2)}\n`);
  } finally {
    server.close();
  }
});
