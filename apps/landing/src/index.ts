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

if (typeof document !== "undefined" && typeof navigator !== "undefined") {
  wireCopyButtons(document, navigator.clipboard);
}
