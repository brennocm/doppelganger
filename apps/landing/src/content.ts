/**
 * Landing content that waits for the go/no-go gate (landing-page design P46).
 *
 * Pure: no DOM, no I/O. A pending value holds `PENDING`; the renderers turn it into a
 * neutral state, so the marker never reaches the built page. This file and its test are the
 * only code that names the marker (scripts/release-check.sh allows them).
 */
import { escapeHtml } from "./evaluation.ts";

/** The marker that stands for "waiting for the gate". */
export const PENDING = "PENDING-GATE";

export const BASE_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; " +
  "connect-src 'self'; img-src 'self' data:; style-src 'self'; media-src 'self' blob:; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'";
export const EMBED_HOST = "www.youtube-nocookie.com";
export const LANDING_CSP = `${BASE_CSP}; frame-src https://${EMBED_HOST}`;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const REPOSITORY = "https://github.com/brennocm/doppelganger/";
const MEDIA = /^media\/[A-Za-z0-9._-]+\.(?:webm|mp4|png|jpg|webp|svg)$/;

export interface LandingContent {
  videoId: string;
  videoPoster: string;
  writeUpUrl: string;
  capture: { video: string; poster: string; alt: string };
}

export class ContentError extends Error {}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ContentError(`content.json: ${name} must be a non-empty string`);
  }
  return value;
}

/** Validate a parsed content.json. A pending value passes; a malformed real one fails the build. */
export function parseContent(raw: unknown): LandingContent {
  if (typeof raw !== "object" || raw === null) {
    throw new ContentError("content.json must be an object");
  }
  const r = raw as Record<string, unknown>;
  const capture = r["capture"];
  if (typeof capture !== "object" || capture === null) {
    throw new ContentError("content.json: capture must be an object");
  }
  const c = capture as Record<string, unknown>;
  const content: LandingContent = {
    videoId: text(r["videoId"], "videoId"),
    videoPoster: text(r["videoPoster"], "videoPoster"),
    writeUpUrl: text(r["writeUpUrl"], "writeUpUrl"),
    capture: {
      video: text(c["video"], "capture.video"),
      poster: text(c["poster"], "capture.poster"),
      alt: text(c["alt"], "capture.alt"),
    },
  };
  if (content.videoId !== PENDING && !VIDEO_ID.test(content.videoId)) {
    throw new ContentError("content.json: videoId must be an 11-character YouTube ID");
  }
  if (content.writeUpUrl !== PENDING && !content.writeUpUrl.startsWith(REPOSITORY)) {
    throw new ContentError(`content.json: writeUpUrl must start with ${REPOSITORY}`);
  }
  for (const file of [content.videoPoster, content.capture.video, content.capture.poster]) {
    if (file !== PENDING && !MEDIA.test(file)) {
      throw new ContentError("content.json: capture files must be media/<name>.<ext>");
    }
  }
  return content;
}

export function videoPending(content: LandingContent): boolean {
  return content.videoId === PENDING;
}

export function capturePending(content: LandingContent): boolean {
  return content.capture.video === PENDING || content.capture.poster === PENDING;
}

/** The Content-Security-Policy: `frame-src` only when a video is embedded (Requirement 7.2). */
export function cspFor(content: LandingContent): string {
  return videoPending(content) ? BASE_CSP : LANDING_CSP;
}

/** The inner HTML of the Video section. */
export function renderVideo(content: LandingContent, base = "./"): string {
  if (videoPending(content)) return "<p>The 3-minute video is not published yet.</p>";
  const embed = `https://${EMBED_HOST}/embed/${content.videoId}`;
  const image =
    content.videoPoster === PENDING
      ? ""
      : `<img src="${escapeHtml(base + content.videoPoster)}" alt="" width="1280" height="720" />`;
  return (
    `<button class="video-facade" type="button" data-embed="${escapeHtml(embed)}">` +
    `${image}<span class="video-play">Play the 3-minute video</span></button>` +
    '<p class="note">The video loads from YouTube\'s privacy-enhanced domain only after you press play.</p>'
  );
}

/** The write-up list item, or nothing while it is pending. */
export function renderWriteUp(content: LandingContent): string {
  if (content.writeUpUrl === PENDING) return "";
  return `<li><a href="${escapeHtml(content.writeUpUrl)}">The write-up</a>: how the project was built, step by step</li>`;
}

/** The hero capture, or nothing while it is pending. */
export function renderCapture(content: LandingContent, base = "./"): string {
  if (capturePending(content)) return "";
  const { video, poster, alt } = content.capture;
  return (
    `<figure class="capture" data-video="${escapeHtml(base + video)}">` +
    `<img src="${escapeHtml(base + poster)}" alt="${escapeHtml(alt)}" width="1280" height="720" />` +
    "</figure>"
  );
}
