/**
 * Main_View wiring (haunted-ui): the state view, the Spectre, motion preference, page
 * visibility, the floating widget and the optional sound cue.
 */
import type { DetectorUpdate } from "@doppelganger/contracts";
import { DEFAULT_CONFIG } from "@doppelganger/detector";
import { createHauntingView, playLowTone, TEAR_AT_MS } from "./features/haunting/haunting-view.ts";
import { createSpectre, type Motion } from "./features/haunting/spectre.ts";
import { uneaseIntensity } from "./features/haunting/spectre-geometry.ts";
import type { ForcedState } from "./features/haunting/test-state.ts";
import {
  openPipWidget,
  PIP_BLOCKED,
  PIP_UNSUPPORTED,
  pipSupported,
  type Widget,
} from "./features/widget/pip-widget.ts";

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found as T;
}

export interface MainView {
  update(update: DetectorUpdate): void;
  levels(bands: readonly number[]): void;
  readonly startProtocol: HTMLButtonElement;
}

export interface MainViewOptions {
  forced: ForcedState | null;
  stop(): void;
  thresholds?: { unease: number; possession: number };
}

/** A fixed, speech-like level shape used before audio arrives and in Test_State_Mode. */
export function restingBands(): Float32Array {
  return Float32Array.from(
    { length: 64 },
    (_, i) =>
      0.25 + 0.45 * Math.exp(-(((i - 18) / 10) ** 2)) + 0.15 * Math.exp(-(((i - 40) / 6) ** 2)),
  );
}

export function createMainView(opts: MainViewOptions): MainView {
  const root = el<HTMLElement>("app");
  const startProtocol = el<HTMLButtonElement>("start-protocol");
  const soundCue = el<HTMLInputElement>("sound-cue");
  const floatButton = el<HTMLButtonElement>("float");
  const floatNote = el("float-note");
  const canvas = el<HTMLCanvasElement>("spectre");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const motion = (): Motion => (reduced.matches ? "reduced" : "full");
  const thresholds = opts.thresholds ?? DEFAULT_CONFIG;
  soundCue.checked = false;

  const view = createHauntingView(
    {
      root,
      headline: el("state-headline"),
      line: el("state-line"),
      iconLabel: el("state-icon"),
      score: el<HTMLOutputElement>("score"),
      polite: el("live-polite"),
      assertive: el("live-assertive"),
      startProtocol,
    },
    {
      instant: opts.forced !== null,
      onPossession: () => {
        if (soundCue.checked) playLowTone();
      },
    },
  );

  root.dataset["motion"] = motion();
  if (canvas.getContext("2d") === null) root.dataset["canvas"] = "none";
  // Test_State_Mode draws one deterministic frame: the static (reduced) treatment.
  const spectreMotion = (): Motion => (opts.forced !== null ? "reduced" : motion());
  const spectre = createSpectre(canvas, spectreMotion());
  reduced.addEventListener("change", () => {
    root.dataset["motion"] = motion();
    spectre.setMotion(spectreMotion());
    widget?.setMotion(motion());
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) spectre.pause();
    else spectre.resume();
  });

  let bands = restingBands();
  let smoothed = 0;
  let widget: Widget | null = null;
  // The Spectre's state; on Possession entry it switches 150 ms after the tint starts.
  let spectreState = view.state;
  const intensity = () => uneaseIntensity(smoothed, thresholds.unease, thresholds.possession);
  const redraw = () => {
    spectre.draw({ bands, state: spectreState, intensity: intensity() });
    widget?.levels(bands, intensity());
  };

  const supported = pipSupported(window as Window & { documentPictureInPicture?: never });
  floatButton.disabled = false;
  floatButton.addEventListener("click", () => {
    if (!supported) {
      root.dataset["layout"] = root.dataset["layout"] === "compact" ? "full" : "compact";
      floatNote.textContent = PIP_UNSUPPORTED;
      floatNote.hidden = false;
      return;
    }
    void openPipWidget(
      window as never,
      motion(),
      { stop: opts.stop, showProtocol: () => startProtocol.click() },
      () => {
        widget = null;
      },
    ).then(
      (opened) => {
        widget = opened;
        floatNote.hidden = true;
        redraw();
      },
      () => {
        floatNote.textContent = PIP_BLOCKED;
        floatNote.hidden = false;
        root.dataset["layout"] = "compact";
      },
    );
  });

  if (opts.forced !== null) {
    root.dataset["testState"] = opts.forced.state;
    smoothed = opts.forced.smoothed;
    view.show(
      opts.forced.state,
      opts.forced.state === "idle" || opts.forced.state === "listening" ? null : smoothed,
    );
    spectreState = view.state;
    redraw();
  } else {
    redraw();
  }

  return {
    startProtocol,
    update(update) {
      if (opts.forced !== null) return;
      if (update.smoothed !== null) smoothed = update.smoothed;
      const before = view.state;
      view.show(update.state, update.smoothed);
      widget?.update(update);
      if (before === update.state) return;
      if (update.state === "possession" && motion() === "full") {
        // Possession sequence: the Spectre tears at 150 ms (haunted-ui design).
        setTimeout(() => {
          if (view.state !== "possession") return;
          spectreState = "possession";
          redraw();
        }, TEAR_AT_MS);
        return;
      }
      spectreState = update.state;
      redraw();
    },
    levels(next) {
      if (opts.forced !== null) return;
      bands = Float32Array.from(next);
      redraw();
    },
  };
}
