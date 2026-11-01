import { describe, expect, it } from "vitest";
import { chirp, noise, silence, sine, voicedSpeech } from "./synthetic-signals.ts";
import { DEFAULT_VAD, isVoiced, neuralVoiceActivity, VAD_FRAME_SAMPLES } from "./voice-activity.ts";

const ONE_SECOND = 16000;

describe("isVoiced", () => {
  it("rejects digital silence", () => {
    expect(isVoiced(silence(ONE_SECOND), DEFAULT_VAD)).toBe(false);
  });

  it("rejects white noise (zero-crossing rate near 0.5)", () => {
    expect(isVoiced(noise(ONE_SECOND, 7), DEFAULT_VAD)).toBe(false);
  });

  it("rejects speech-like signal below the energy floor", () => {
    expect(isVoiced(voicedSpeech(ONE_SECOND, 0.005), DEFAULT_VAD)).toBe(false);
  });

  it("accepts a voiced-speech stand-in", () => {
    expect(isVoiced(voicedSpeech(ONE_SECOND), DEFAULT_VAD)).toBe(true);
  });

  it("accepts a low tone and rejects a high one by zero crossings", () => {
    expect(isVoiced(sine(ONE_SECOND, 200), DEFAULT_VAD)).toBe(true);
    // 3.5 kHz crosses zero 7000 times per second: rate 0.44.
    expect(isVoiced(sine(ONE_SECOND, 3500), DEFAULT_VAD)).toBe(false);
  });

  it("applies minVoicedFraction to the share of voiced frames", () => {
    const window = new Float32Array(ONE_SECOND);
    window.set(voicedSpeech(ONE_SECOND / 4)); // 12.5 of 50 frames voiced
    expect(isVoiced(window, { ...DEFAULT_VAD, minVoicedFraction: 0.2 })).toBe(true);
    expect(isVoiced(window, { ...DEFAULT_VAD, minVoicedFraction: 0.3 })).toBe(false);
  });

  it("treats frames with NaN or infinity as unvoiced", () => {
    const window = voicedSpeech(VAD_FRAME_SAMPLES * 2);
    window[3] = Number.NaN;
    window[VAD_FRAME_SAMPLES + 3] = Number.POSITIVE_INFINITY;
    expect(isVoiced(window, { ...DEFAULT_VAD, minVoicedFraction: 0.01 })).toBe(false);
  });

  it("handles empty and single-sample windows", () => {
    expect(isVoiced(new Float32Array(0), DEFAULT_VAD)).toBe(false);
    expect(isVoiced(Float32Array.of(0.5), DEFAULT_VAD)).toBe(true);
  });

  it("uses its thresholds from configuration", () => {
    const sweep = chirp(ONE_SECOND, 100, 7000);
    expect(isVoiced(sweep, { ...DEFAULT_VAD, maxZeroCrossingRate: 1 })).toBe(true);
    expect(isVoiced(sweep, { ...DEFAULT_VAD, maxZeroCrossingRate: 0.01 })).toBe(false);
  });
});

describe("neuralVoiceActivity", () => {
  const backend = (value: number) => ({
    load: () => Promise.resolve(),
    run: () => Promise.resolve(Float32Array.of(value)),
    dispose: () => Promise.resolve(),
  });

  it("compares the backend's speech probability with the threshold", async () => {
    expect(await neuralVoiceActivity(backend(0.8))(silence(4))).toBe(true);
    expect(await neuralVoiceActivity(backend(0.2))(silence(4))).toBe(false);
    expect(await neuralVoiceActivity(backend(0.2), 0.1)(silence(4))).toBe(true);
  });

  it("treats a non-finite probability as unvoiced", async () => {
    expect(await neuralVoiceActivity(backend(Number.NaN))(silence(4))).toBe(false);
  });
});
