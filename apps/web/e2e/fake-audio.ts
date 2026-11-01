/**
 * Synthetic audio for Chromium's fake capture device (testing steering): a seeded,
 * voiced-speech stand-in written to a git-ignored temp folder and removed after the run.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FAKE_AUDIO_DIR = join(tmpdir(), "doppelganger-e2e");
export const FAKE_AUDIO_FILE = join(FAKE_AUDIO_DIR, "voice.wav");

/** 16-bit PCM mono WAV: a 120 Hz harmonic series with a 4 Hz syllable envelope. */
export function voicedWav(seconds = 12, rate = 48000): Buffer {
  const samples = seconds * rate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    let v = 0;
    for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * 120 * k * t) / k;
    const envelope = 0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t);
    data.writeInt16LE(Math.round(((0.4 * envelope * v) / 2.3) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export default function globalSetup(): () => void {
  mkdirSync(FAKE_AUDIO_DIR, { recursive: true });
  writeFileSync(FAKE_AUDIO_FILE, voicedWav());
  return () => rmSync(FAKE_AUDIO_DIR, { recursive: true, force: true });
}
