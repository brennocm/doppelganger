/**
 * Seeded synthetic test signals at 16 kHz (testing steering): no audio file is read or
 * committed for tests. Not exported from the package index.
 */
const RATE = 16000;

/** Deterministic uniform values in [-1, 1) from a 32-bit LCG. */
export function seededUniform(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 31 - 1;
  };
}

export function silence(samples: number): Float32Array {
  return new Float32Array(samples);
}

export function sine(samples: number, hz: number, amplitude = 0.5): Float32Array {
  return Float32Array.from(
    { length: samples },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE),
  );
}

export function noise(samples: number, seed: number, amplitude = 0.3): Float32Array {
  const next = seededUniform(seed);
  return Float32Array.from({ length: samples }, () => amplitude * next());
}

/** Linear chirp from `fromHz` to `toHz`. */
export function chirp(samples: number, fromHz: number, toHz: number, amplitude = 0.5) {
  const seconds = samples / RATE;
  return Float32Array.from({ length: samples }, (_, i) => {
    const t = i / RATE;
    const phase = 2 * Math.PI * (fromHz * t + ((toHz - fromHz) * t * t) / (2 * seconds));
    return amplitude * Math.sin(phase);
  });
}

/** Voiced-speech stand-in: a 120 Hz harmonic series with a 4 Hz syllable envelope. */
export function voicedSpeech(samples: number, amplitude = 0.4): Float32Array {
  return Float32Array.from({ length: samples }, (_, i) => {
    const t = i / RATE;
    const envelope = 0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t);
    let v = 0;
    for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * 120 * k * t) / k;
    return (amplitude * envelope * v) / 2.3;
  });
}
