/**
 * Synthetic audio for Chromium's fake capture device (testing steering): a deterministic,
 * voiced-speech stand-in written to a fresh private temp folder and removed after the run.
 * playwright.config.ts creates the folder (it needs the path for the launch flags) and
 * this global setup writes the file and removes the folder at teardown.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENV = "DOPPELGANGER_FAKE_AUDIO_DIR";

/** A unique folder per run (mkdtemp: mode 0700, no predictable name to pre-create). */
export function fakeAudioFile(): string {
  const existing = process.env[ENV];
  const dir = existing ?? mkdtempSync(join(tmpdir(), "doppelganger-e2e-"));
  process.env[ENV] = dir;
  return join(dir, "voice.wav");
}

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
  const file = fakeAudioFile();
  // "wx": fail rather than follow anything already at that path.
  writeFileSync(file, voicedWav(), { flag: "wx" });
  return () => rmSync(join(file, ".."), { recursive: true, force: true });
}
