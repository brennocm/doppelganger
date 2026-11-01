/** Session statistics for the incident report (Requirement 6). Never holds audio. */
import type { HauntingState, SessionStats } from "@doppelganger/contracts";

export interface StatsTracker {
  /** Start a new session at `at` (state Idle). */
  reset(at: number): void;
  transition(from: HauntingState, to: HauntingState, at: number): void;
  voiced(ms: number, smoothed: number | null): void;
  dropped(): void;
  failed(): void;
  /** A copy, with the time spent so far in the current state included. */
  snapshot(now: number): SessionStats;
}

const zeroStates = (): SessionStats["msInState"] => ({
  idle: 0,
  listening: 0,
  mask: 0,
  unease: 0,
  possession: 0,
  exorcised: 0,
});

export function createStatsTracker(createdAt: number): StatsTracker {
  let stats: SessionStats = {
    startedAt: null,
    voicedMs: 0,
    peak: null,
    msInState: zeroStates(),
    transitions: [],
    droppedWindows: 0,
    failedWindows: 0,
    scoredWindows: 0,
    meanSmoothed: null,
  };
  let sum = 0;
  let state: HauntingState = "idle";
  let since = createdAt;

  return {
    reset(at) {
      stats = {
        startedAt: at,
        voicedMs: 0,
        peak: null,
        msInState: zeroStates(),
        transitions: [],
        droppedWindows: 0,
        failedWindows: 0,
        scoredWindows: 0,
        meanSmoothed: null,
      };
      sum = 0;
      state = "idle";
      since = at;
    },
    transition(from, to, at) {
      stats.msInState[from] += Math.max(0, at - since);
      stats.transitions.push({ from, to, at });
      state = to;
      since = at;
    },
    voiced(ms, smoothed) {
      stats.voicedMs += ms;
      if (smoothed === null) return;
      if (stats.peak === null || smoothed > stats.peak) stats.peak = smoothed;
      sum += smoothed;
      stats.scoredWindows += 1;
      stats.meanSmoothed = sum / stats.scoredWindows;
    },
    dropped() {
      stats.droppedWindows += 1;
    },
    failed() {
      stats.failedWindows += 1;
    },
    snapshot(now) {
      const msInState = { ...stats.msInState };
      msInState[state] += Math.max(0, now - since);
      return {
        ...stats,
        msInState,
        transitions: stats.transitions.map((t) => ({ ...t })),
      };
    },
  };
}
