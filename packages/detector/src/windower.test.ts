import { describe, expect, it } from "vitest";
import golden from "../../contracts/fixtures/golden/windowing.json" with { type: "json" };
import { type AudioWindow, ConfigError, createWindower } from "./windower.ts";

function feed(windowSamples: number, hopSamples: number, chunks: number[][]): AudioWindow[] {
  const windower = createWindower({ windowSamples, hopSamples });
  return chunks.flatMap((chunk) => windower.push(chunk));
}

function plain(windows: AudioWindow[]) {
  return windows.map((w) => ({
    index: w.index,
    startSample: w.startSample,
    samples: Array.from(w.samples),
  }));
}

describe("createWindower", () => {
  it.each(golden.cases.map((c, i) => [i, c] as const))(
    "matches golden windowing case %i for every chunking",
    (_, c) => {
      for (const split of c.chunkings) {
        const chunks: number[][] = [];
        let at = 0;
        for (const length of split) {
          chunks.push(c.signal.slice(at, at + length));
          at += length;
        }
        expect(plain(feed(c.windowSamples, c.hopSamples, chunks))).toEqual(c.windows);
      }
    },
  );

  it("emits nothing before a full window", () => {
    const windower = createWindower({ windowSamples: 4, hopSamples: 2 });
    expect(windower.push([0.1, 0.2, 0.3])).toEqual([]);
    expect(windower.buffered()).toBe(3);
  });

  it("forgets buffered samples and indices on reset", () => {
    const windower = createWindower({ windowSamples: 2, hopSamples: 2 });
    windower.push([0.1, 0.2, 0.3]);
    windower.reset();
    expect(windower.buffered()).toBe(0);
    const [first] = windower.push([0.5, 0.25]);
    expect(first?.index).toBe(0);
    expect(first?.startSample).toBe(0);
    expect(Array.from(first?.samples ?? [])).toEqual([0.5, 0.25]);
  });

  it("returns windows that later pushes do not change", () => {
    const windower = createWindower({ windowSamples: 2, hopSamples: 1 });
    const [first] = windower.push([0.5, 0.25]);
    windower.push([1, 1, 1]);
    expect(Array.from(first?.samples ?? [])).toEqual([0.5, 0.25]);
  });

  it.each([
    ["windowSamples", { windowSamples: 0, hopSamples: 1 }],
    ["hopSamples", { windowSamples: 4, hopSamples: 1.5 }],
    ["windowSamples", { windowSamples: Number.NaN, hopSamples: 1 }],
  ])("rejects an invalid %s", (key, cfg) => {
    expect(() => createWindower(cfg)).toThrow(ConfigError);
    expect(() => createWindower(cfg)).toThrow(key);
  });
});
