/**
 * Landing page entry point: tokens, styles and the copy buttons (landing-page design P38).
 * The page is complete without JavaScript; this only adds copying.
 */
import "@doppelganger/tokens/tokens.css";
import "./landing.css";

export const PACKAGE_NAME = "@doppelganger/landing";

/** Minimal clipboard surface, injectable for tests. */
export interface Clipboard {
  writeText(text: string): Promise<void>;
}

/**
 * Copy the text of the element a button points to (`data-copy="<id>"`) and report the
 * result in the live region. Without clipboard access, select the command instead.
 */
export async function copyCommand(
  button: HTMLElement,
  doc: Document,
  clipboard: Clipboard | undefined,
  schedule: (run: () => void) => void = (run) => requestAnimationFrame(() => run()),
): Promise<string> {
  const target = doc.getElementById(button.dataset["copy"] ?? "");
  const status = doc.getElementById("copy-status");
  if (target === null) return "";
  const text = target.textContent ?? "";
  const name = button.dataset["name"];
  let message = name === undefined ? "Copied to the clipboard." : `${name} copied.`;
  try {
    if (clipboard === undefined) throw new Error("no clipboard");
    await clipboard.writeText(text);
  } catch {
    const range = doc.createRange();
    range.selectNodeContents(target);
    const selection = doc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    message = "Selected. Press Ctrl+C to copy.";
  }
  if (status !== null) {
    // Clear first so a second click with the same message is announced again.
    status.textContent = "";
    schedule(() => {
      status.textContent = message;
    });
  }
  return message;
}

/** Wire every copy button in the document. */
export function wireCopyButtons(doc: Document, clipboard: Clipboard | undefined): number {
  const buttons = Array.from(doc.querySelectorAll<HTMLElement>("button[data-copy]"));
  for (const button of buttons) {
    button.addEventListener("click", () => {
      void copyCommand(button, doc, clipboard);
    });
  }
  return buttons.length;
}

/** Swap the capture's poster for the looping clip, unless the visitor prefers less motion. */
export function playCapture(figure: HTMLElement, doc: Document): boolean {
  const source = figure.dataset["video"];
  if (source === undefined || source === "" || figure.querySelector("video") !== null) {
    return false;
  }
  const video = doc.createElement("video");
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = "none";
  video.src = source;
  video.setAttribute("aria-hidden", "true");
  const poster = figure.querySelector("img");
  if (poster !== null) video.poster = poster.getAttribute("src") ?? "";
  figure.append(video);
  figure.classList.add("playing");
  return true;
}

function wirePage(doc: Document, win: Window): void {
  wireCopyButtons(doc, win.navigator.clipboard);
  const figure = doc.querySelector<HTMLElement>("figure.capture");
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (figure !== null && !reduced && typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        playCapture(figure, doc);
        observer.disconnect();
      }
    });
    observer.observe(figure);
  }
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  wirePage(document, window);
}
