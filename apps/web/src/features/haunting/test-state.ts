/**
 * Test_State_Mode (haunted-ui Requirement 8): `?test-state=<state>&score=<0-100>` forces a
 * state without capture, in development and E2E builds only. The production build passes
 * mode "production" and always gets null.
 */
import type { HauntingState } from "@doppelganger/contracts";
import { HAUNTING_STATES } from "@doppelganger/detector";

export interface ForcedState {
  state: HauntingState;
  /** Smoothed score in [0, 1]. */
  smoothed: number;
}

const DEFAULT_SCORES: Readonly<Record<HauntingState, number>> = {
  idle: 0,
  listening: 0,
  mask: 0.12,
  unease: 0.52,
  possession: 0.91,
  exorcised: 0.88,
};

export function parseTestState(search: string, mode: string): ForcedState | null {
  if (mode === "production") return null;
  const params = new URLSearchParams(search);
  const state = params.get("test-state");
  if (state === null || !(HAUNTING_STATES as readonly string[]).includes(state)) return null;
  const forced = state as HauntingState;
  const raw = params.get("score");
  const score = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
  const smoothed =
    Number.isInteger(score) && score >= 0 && score <= 100 ? score / 100 : DEFAULT_SCORES[forced];
  return { state: forced, smoothed };
}
