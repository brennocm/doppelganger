/**
 * Landing content kept outside the HTML (landing-page design P46): the write-up link and an
 * optional hero capture of the app.
 *
 * Pure: no DOM, no I/O. A malformed value fails the build instead of reaching the page.
 */
import { escapeHtml } from "./evaluation.ts";

/** The landing loads nothing from another origin, so one policy covers every build. */
export const BASE_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; " +
  "connect-src 'self'; img-src 'self' data:; style-src 'self'; media-src 'self' blob:; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'";

const REPOSITORY = "https://github.com/brennocm/doppelganger/";
const MEDIA = /^media\/[A-Za-z0-9._-]+\.(?:webm|mp4|png|jpg|webp|svg)$/;

export interface Capture {
  video: string;
  poster: string;
  alt: string;
  /** Visible caption, for example to say the scores were fixed by a test. */
  caption: string;
}

export interface LandingContent {
  writeUpUrl: string;
  /** The hero capture, or null for none. */
  capture: Capture | null;
}

export class ContentError extends Error {}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ContentError(`content.json: ${name} must be a non-empty string`);
  }
  return value;
}

function parseCapture(raw: unknown): Capture | null {
  if (raw === null) return null;
  if (typeof raw !== "object") {
    throw new ContentError("content.json: capture must be an object or null");
  }
  const c = raw as Record<string, unknown>;
  const capture = {
    video: text(c["video"], "capture.video"),
    poster: text(c["poster"], "capture.poster"),
    alt: text(c["alt"], "capture.alt"),
    caption: text(c["caption"], "capture.caption"),
  };
  for (const file of [capture.video, capture.poster]) {
    if (!MEDIA.test(file)) {
      throw new ContentError("content.json: capture files must be media/<name>.<ext>");
    }
  }
  return capture;
}

/** Validate a parsed content.json. */
export function parseContent(raw: unknown): LandingContent {
  if (typeof raw !== "object" || raw === null) {
    throw new ContentError("content.json must be an object");
  }
  const r = raw as Record<string, unknown>;
  const writeUpUrl = text(r["writeUpUrl"], "writeUpUrl");
  if (!writeUpUrl.startsWith(REPOSITORY)) {
    throw new ContentError(`content.json: writeUpUrl must start with ${REPOSITORY}`);
  }
  return { writeUpUrl, capture: parseCapture(r["capture"] ?? null) };
}

/** The media files the content names, relative to the public folder. */
export function mediaFiles(content: LandingContent): string[] {
  return content.capture === null ? [] : [content.capture.video, content.capture.poster];
}

/** The write-up list item. */
export function renderWriteUp(content: LandingContent): string {
  return `<li><a href="${escapeHtml(content.writeUpUrl)}">The write-up</a>: how the project was built, step by step</li>`;
}

/** The hero capture, or nothing when there is none. */
export function renderCapture(content: LandingContent, base = "./"): string {
  if (content.capture === null) return "";
  const { video, poster, alt, caption } = content.capture;
  return (
    `<figure class="capture" data-video="${escapeHtml(base + video)}">` +
    `<img src="${escapeHtml(base + poster)}" alt="${escapeHtml(alt)}" width="1280" height="720" />` +
    `<figcaption>${escapeHtml(caption)}</figcaption>` +
    "</figure>"
  );
}
