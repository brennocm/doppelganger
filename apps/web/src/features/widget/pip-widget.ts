/**
 * Floating widget (haunted-ui Requirement 5): a 320 × 180 Document Picture-in-Picture
 * window with the headline, score, a compact Spectre and Stop; or, where that API is
 * missing, the compact in-page layout.
 */
import type { DetectorUpdate } from "@doppelganger/contracts";
import { present } from "../haunting/presentation.ts";
import { createSpectre, type Motion, type Spectre } from "../haunting/spectre.ts";

interface PipApi {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

export function pipSupported(win: Window & { documentPictureInPicture?: PipApi }): boolean {
  return typeof win.documentPictureInPicture?.requestWindow === "function";
}

export const PIP_UNSUPPORTED =
  "This browser can't float a window over the call, so the compact layout is shown here instead.";
export const PIP_BLOCKED = "Your browser blocked the floating window. Click the button again.";

export interface WidgetHandlers {
  stop(): void;
  showProtocol(): void;
}

export interface Widget {
  update(update: DetectorUpdate): void;
  levels(bands: Float32Array, intensity: number): void;
  setMotion(motion: Motion): void;
  close(): void;
}

/**
 * Copy the app's styles into the PiP document: <link> sheets in a build, <style> elements
 * in vite dev. Both come from 'self', so the CSP still holds.
 */
function copyStyles(from: Document, to: Document): void {
  for (const node of from.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
    'link[rel="stylesheet"], style',
  )) {
    to.head.append(to.importNode(node, true));
  }
}

export async function openPipWidget(
  win: Window & { documentPictureInPicture?: PipApi },
  motion: Motion,
  handlers: WidgetHandlers,
  onClosed: () => void,
): Promise<Widget> {
  const api = win.documentPictureInPicture;
  if (api === undefined) throw new Error("Document Picture-in-Picture is not supported");
  const pip = await api.requestWindow({ width: 320, height: 180 });
  const doc = pip.document;
  copyStyles(win.document, doc);
  const root = doc.createElement("main");
  root.className = "app widget";
  root.dataset["state"] = "idle";
  root.dataset["motion"] = motion;
  root.dataset["layout"] = "compact";
  const headline = doc.createElement("p");
  headline.className = "headline";
  const score = doc.createElement("p");
  score.className = "score";
  const value = doc.createElement("output");
  value.className = "score-value";
  score.append("Dissonance ", value);
  const canvas = doc.createElement("canvas");
  canvas.className = "spectre";
  canvas.setAttribute("aria-hidden", "true");
  const actions = doc.createElement("div");
  actions.className = "actions";
  const stop = doc.createElement("button");
  stop.type = "button";
  stop.className = "button button-secondary";
  stop.textContent = "Stop";
  stop.addEventListener("click", handlers.stop);
  const protocol = doc.createElement("button");
  protocol.type = "button";
  protocol.className = "button button-primary";
  protocol.textContent = "Show the protocol";
  protocol.hidden = true;
  protocol.addEventListener("click", () => {
    win.focus();
    handlers.showProtocol();
  });
  actions.append(protocol, stop);
  const row = doc.createElement("div");
  row.className = "readout-row";
  row.append(score, actions);
  const live = doc.createElement("div");
  live.className = "visually-hidden";
  live.setAttribute("aria-live", "assertive");
  root.append(headline, canvas, row, live);
  doc.body.append(root);
  const spectre: Spectre = createSpectre(canvas, motion);
  let state = "idle";
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) spectre.pause();
    else spectre.resume();
  });

  // Closing the window ends the widget only; the session in the Main_View continues.
  pip.addEventListener(
    "pagehide",
    () => {
      spectre.dispose();
      onClosed();
    },
    { once: true },
  );

  return {
    update(update) {
      const p = present(update.state, update.smoothed);
      root.dataset["state"] = update.state;
      headline.textContent = p.headline;
      value.value = p.score;
      protocol.hidden = update.state !== "possession";
      if (update.state === "possession" && state !== "possession") live.textContent = p.headline;
      state = update.state;
    },
    levels(bands, intensity) {
      spectre.draw({ bands, state: root.dataset["state"] as DetectorUpdate["state"], intensity });
    },
    setMotion(next) {
      root.dataset["motion"] = next;
      spectre.setMotion(next);
    },
    close() {
      pip.close();
    },
  };
}
