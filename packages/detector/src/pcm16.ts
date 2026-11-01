/**
 * PCM16 little-endian mono, the wire format to the local engine (local-runtime 3.1).
 * Encode: round(clamp(x) × 32768), clamped to [−32768, 32767]. Decode: n / 32768.
 */

export function encodePcm16(samples: ArrayLike<number>): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    const x = Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0;
    out[i] = Math.min(32767, Math.max(-32768, Math.round(x * 32768)));
  }
  return out;
}

export function decodePcm16(pcm: ArrayLike<number>): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] ?? 0) / 32768;
  return out;
}

/** Little-endian bytes of the encoded samples, as sent in a WebSocket binary frame. */
export function pcm16Bytes(samples: ArrayLike<number>): Uint8Array {
  const pcm = encodePcm16(samples);
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i++) view.setInt16(i * 2, pcm[i] ?? 0, true);
  return bytes;
}
