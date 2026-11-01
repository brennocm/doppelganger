/**
 * Autopsy intake (autopsy-mode Requirement 1): size check before reading, in-memory decode,
 * duration check, then downmix and resample with the audio-capture primitives.
 */
import { createResampler, downmix, TARGET_RATE } from "../capture/resampler.ts";

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_SECONDS = 5 * 60;

export const MESSAGES = {
  "too-large": "This file is over 20 MB. Trim it to under 5 minutes and try again.",
  "too-long": "This recording is longer than 5 minutes. Trim it and try again.",
  "decode-failed": "This browser can't read this file. Convert it to WAV and drop it again.",
  cancelled: "Analysis cancelled. Nothing was kept.",
} as const;

export type IntakeError = keyof typeof MESSAGES;

export type IntakeResult =
  | { ok: true; samples: Float32Array; durationS: number }
  | { ok: false; error: IntakeError };

/** What intake needs from the decoded audio (an AudioBuffer satisfies it). */
export interface DecodedAudio {
  readonly sampleRate: number;
  readonly duration: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface FileLike {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type Decode = (bytes: ArrayBuffer) => Promise<DecodedAudio>;

/** Rejects by size first: an oversized file is never read or decoded (Property 4). */
export async function intake(file: FileLike, decode: Decode): Promise<IntakeResult> {
  if (!(file.size <= MAX_BYTES)) return { ok: false, error: "too-large" };
  let decoded: DecodedAudio;
  try {
    decoded = await decode(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "decode-failed" };
  }
  if (!(decoded.duration <= MAX_SECONDS)) return { ok: false, error: "too-long" };
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
    decoded.getChannelData(c),
  );
  const mono = downmix(channels);
  let samples: Float32Array;
  try {
    samples = createResampler(Math.round(decoded.sampleRate)).process(mono);
  } catch {
    return { ok: false, error: "decode-failed" };
  }
  return { ok: true, samples, durationS: samples.length / TARGET_RATE };
}

const FORMATS: readonly [string, string][] = [
  ["WAV", "audio/wav"],
  ["MP3", "audio/mpeg"],
  ["Ogg Opus", 'audio/ogg; codecs="opus"'],
  ["WebM Opus", 'audio/webm; codecs="opus"'],
  ["FLAC", "audio/flac"],
  ["AAC (M4A)", 'audio/mp4; codecs="mp4a.40.2"'],
];

/** Formats this browser says it can play (Requirement 1.2). */
export function supportedFormats(canPlayType: (type: string) => string): string[] {
  return FORMATS.filter(([, type]) => canPlayType(type) !== "").map(([name]) => name);
}
