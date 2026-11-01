/**
 * Golden vectors for smoothing and the Haunting_Machine, shared with the Python port in
 * packages/model-lab (detection-model 3.2). `vitest run -u` rewrites the file.
 */
import type { DetectorConfig } from "@doppelganger/contracts";
import { expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  type HauntingEvent,
  INITIAL_STATE,
  transition,
} from "./haunting-machine.ts";
import { createSmoother } from "./smoother.ts";

type Input =
  | { type: "window-scored"; at: number; raw: number }
  | { type: Exclude<HauntingEvent["type"], "window-scored">; at: number };

const scored = (from: number, raws: number[]): Input[] =>
  raws.map((raw, i) => ({ type: "window-scored", at: from + i * 1000, raw }));
const silences = (from: number, count: number, step = 1000): Input[] =>
  Array.from({ length: count }, (_, i) => ({ type: "silence", at: from + i * step }));
const start: Input = { type: "capture-started", at: 0 };
const repeat = (raw: number, n: number) => Array<number>(n).fill(raw);

const CASES: { name: string; config: DetectorConfig; events: Input[] }[] = [
  {
    name: "clone ramps up",
    config: DEFAULT_CONFIG,
    events: [start, ...scored(1000, [0.1, 0.2, 0.3, 0.6, 0.9, 0.95, 0.95, 0.95, 0.95, 0.9])],
  },
  {
    name: "genuine speech with isolated spikes",
    config: DEFAULT_CONFIG,
    events: [start, ...scored(1000, [0.1, 0.95, 0.1, 0.1, 0.95, 0.2, 0.1, 0.15, 0.97, 0.05])],
  },
  {
    name: "possession then slow release",
    config: DEFAULT_CONFIG,
    events: [start, ...scored(1000, [...repeat(0.95, 5), ...repeat(0.05, 9)])],
  },
  {
    name: "exorcised, then possessed again, then stopped",
    config: DEFAULT_CONFIG,
    events: [
      start,
      ...scored(1000, repeat(0.95, 4)),
      { type: "protocol-completed", at: 4500 },
      ...scored(5000, [...repeat(0.95, 4), ...repeat(0.05, 6)]),
      { type: "capture-stopped", at: 15000 },
    ],
  },
  {
    name: "silence shows Listening, but Possession persists",
    config: DEFAULT_CONFIG,
    events: [
      start,
      ...scored(1000, [0.5, 0.5]),
      ...silences(3000, 3),
      ...scored(6000, repeat(0.99, 6)),
      ...silences(12000, 5, 2000),
    ],
  },
  {
    name: "alpha 1 with values exactly at the thresholds",
    config: { ...DEFAULT_CONFIG, alpha: 1 },
    events: [start, ...scored(1000, [0.4, 0.7, 0.7, 0.7, 0.5, 0.49, 0.49, 0.49, 0.49, 0.49, 0.4])],
  },
];

function expected(config: DetectorConfig, events: Input[]) {
  const smoother = createSmoother(config.alpha);
  let s = INITIAL_STATE;
  let smoothed: number | null = null;
  return events.map((input) => {
    let event: HauntingEvent;
    if (input.type === "window-scored") {
      smoothed = smoother.next(input.raw);
      event = { type: input.type, at: input.at, smoothed };
    } else {
      if (input.type === "capture-stopped") {
        smoother.reset();
        smoothed = null;
      }
      event = input;
    }
    s = transition(s, event, config);
    return { state: s.state, smoothed };
  });
}

/** One JSON line per event, so diffs stay readable. Not formatted by Biome. */
function render(): string {
  const cases = CASES.map((c) => {
    const out = expected(c.config, c.events);
    const steps = c.events
      .map((e, i) => `        ${JSON.stringify({ event: e, expect: out[i] })}`)
      .join(",\n");
    return `    {\n      "name": ${JSON.stringify(c.name)},\n      "config": ${JSON.stringify(c.config)},\n      "steps": [\n${steps}\n      ]\n    }`;
  });
  const description =
    "EMA smoothing and Haunting_Machine transitions (detection-core design). Smoothing restarts after capture-stopped.";
  return `{\n  "description": ${JSON.stringify(description)},\n  "cases": [\n${cases.join(",\n")}\n  ]\n}\n`;
}

it("matches the committed haunting golden vectors", async () => {
  await expect(render()).toMatchFileSnapshot("../../contracts/fixtures/golden/haunting.json");
});
