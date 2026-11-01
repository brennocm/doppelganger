import { describe, expect, it, vi } from "vitest";
import { detectEngine, ENGINE_MESSAGES, engineAutopsy } from "./engine-autopsy.ts";
import { MAX_BYTES } from "./intake.ts";

const ORIGIN = "http://127.0.0.1:8787";
const TOKEN = "t".repeat(43);
const report = {
  modelId: "pro-model",
  modelVersion: "1.0.0",
  durationS: 8,
  windows: [],
  states: [],
  verdict: "inconclusive",
  verdictReason: "Not enough speech",
};

const reply = (status: number, body: unknown) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("detectEngine", () => {
  it("needs a token and a healthy same-origin engine", async () => {
    const fetchFn = vi.fn(reply(200, { status: "ok", modelId: "pro-model", formats: ["wav"] }));
    expect(await detectEngine(ORIGIN, TOKEN, fetchFn)).toEqual({
      modelId: "pro-model",
      formats: ["wav"],
    });
    expect(fetchFn).toHaveBeenCalledWith(
      `${ORIGIN}/healthz`,
      expect.objectContaining({ redirect: "error" }),
    );
    expect(await detectEngine(ORIGIN, null, fetchFn)).toBeNull();
    expect(await detectEngine(ORIGIN, TOKEN, reply(404, {}))).toBeNull();
    expect(await detectEngine(ORIGIN, TOKEN, reply(200, "<html>"))).toBeNull();
  });
});

describe("engineAutopsy", () => {
  it("posts the file with the token to the same origin and returns the shared report", async () => {
    const fetchFn = vi.fn(reply(200, report));
    const result = await engineAutopsy(new Blob([new Uint8Array(10)]), ORIGIN, TOKEN, fetchFn);
    expect(result).toEqual({ ok: true, report });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ORIGIN}/v1/autopsy`);
    expect((init.headers as Record<string, string>)["authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("refuses an oversized file without sending it", async () => {
    const fetchFn = vi.fn(reply(200, report));
    const big = { size: MAX_BYTES + 1 } as Blob;
    expect(await engineAutopsy(big, ORIGIN, TOKEN, fetchFn)).toEqual({
      ok: false,
      message: ENGINE_MESSAGES["too-large"],
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [415, {}, ENGINE_MESSAGES.unsupported],
    [413, { error: "too-long" }, ENGINE_MESSAGES["too-long"]],
    [403, {}, ENGINE_MESSAGES.refused],
    [500, {}, ENGINE_MESSAGES.failed],
    [200, { ...report, samples: [1] }, ENGINE_MESSAGES.failed],
  ])("maps status %i to a message", async (status, body, message) => {
    expect(await engineAutopsy(new Blob(["x"]), ORIGIN, TOKEN, reply(status, body))).toEqual({
      ok: false,
      message,
    });
  });
});
