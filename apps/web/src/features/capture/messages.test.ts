import { describe, expect, it } from "vitest";
import {
  captureMessage,
  isSlowDevice,
  modelNote,
  offersReplay,
  PRIVACY_NOTICE,
  TEST_MODEL,
  UNMEASURED_MODEL,
  workerMessage,
} from "./messages.ts";

describe("model note", () => {
  it("says the test model detects nothing and the real models are unmeasured on calls", () => {
    expect(modelNote("test")).toBe(TEST_MODEL);
    expect(modelNote("light")).toBe(UNMEASURED_MODEL);
    expect(modelNote("pro")).toBe(UNMEASURED_MODEL);
    expect(UNMEASURED_MODEL).toContain("hasn't been measured on call audio");
  });
});

describe("capture messages", () => {
  it("uses the design's wording for the documented errors", () => {
    expect(captureMessage("no-tab-audio")).toBe(
      "That tab was shared without its audio. Share it again and turn on 'Share tab audio'.",
    );
    expect(captureMessage("permission-denied")).toContain("or try a replay");
    expect(workerMessage("model-integrity")).toContain("failed its integrity check");
    expect(workerMessage("wasm-unsupported")).toBe(
      "This browser can't run the detector. Use a recent Chrome, Edge or Firefox.",
    );
  });

  it("states the privacy facts before any permission (Requirement 5.1)", () => {
    expect(PRIVACY_NOTICE).toMatch(/on this device/);
    expect(PRIVACY_NOTICE).toMatch(/never recorded/);
    expect(PRIVACY_NOTICE).toMatch(/never uploaded/);
  });

  it("offers replay after a denial (Requirement 5.2)", () => {
    expect(offersReplay("permission-denied")).toBe(true);
    expect(offersReplay("replay-failed")).toBe(false);
  });

  it("flags a slow device when p95 exceeds the hop (Requirement 4.3)", () => {
    expect(isSlowDevice(999, 16000)).toBe(false);
    expect(isSlowDevice(1000.5, 16000)).toBe(true);
  });

  it("never uses exclamation marks or 'Oops' (design-system copy voice)", () => {
    const all = [
      PRIVACY_NOTICE,
      ...(["no-tab-audio", "permission-denied", "unsupported", "replay-failed"] as const).map(
        captureMessage,
      ),
      ...(["model-integrity", "model-load", "wasm-unsupported"] as const).map(workerMessage),
    ];
    for (const text of all) expect(text).not.toMatch(/!|oops/i);
  });
});
