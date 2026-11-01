/**
 * Autopsy on the local Pro engine (autopsy-mode Requirement 4): offered only when the app is
 * served by the engine (same-origin `/healthz` answers and a session token is present). The
 * file goes to the engine's same-origin endpoint with the token; the answer must match the
 * shared AutopsyReport schema.
 */
import { type AutopsyReport, parseAutopsyReport } from "@doppelganger/contracts";
import { MAX_BYTES } from "./intake.ts";

type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export interface EngineInfo {
  modelId: string;
  formats: string[];
}

export type EngineResult = { ok: true; report: AutopsyReport } | { ok: false; message: string };

export const ENGINE_MESSAGES = {
  unsupported:
    "The local engine reads WAV files only. Convert the file to WAV, or analyze it in this browser.",
  "too-large": "This file is over 20 MB. Trim it to under 5 minutes and try again.",
  "too-long": "This recording is longer than 5 minutes. Trim it and try again.",
  refused:
    "The local engine refused the request. Open the app again from the link the engine printed.",
  failed: "The local engine could not analyze this file. Try again, or analyze it in this browser.",
} as const;

/** The engine at the page's own origin, or null (for example on GitHub Pages). */
export async function detectEngine(
  origin: string,
  token: string | null,
  fetchFn: FetchLike,
): Promise<EngineInfo | null> {
  if (token === null) return null;
  try {
    const response = await fetchFn(new URL("/healthz", origin).href, {
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<EngineInfo> & { status?: unknown };
    if (data.status !== "ok" || typeof data.modelId !== "string" || !Array.isArray(data.formats))
      return null;
    return {
      modelId: data.modelId,
      formats: data.formats.filter((f): f is string => typeof f === "string"),
    };
  } catch {
    return null;
  }
}

export async function engineAutopsy(
  file: Blob,
  origin: string,
  token: string,
  fetchFn: FetchLike,
): Promise<EngineResult> {
  if (!(file.size <= MAX_BYTES)) return { ok: false, message: ENGINE_MESSAGES["too-large"] };
  let response: Pick<Response, "ok" | "status" | "json">;
  try {
    response = await fetchFn(new URL("/v1/autopsy", origin).href, {
      method: "POST",
      body: file,
      credentials: "same-origin",
      redirect: "error",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream" },
    });
  } catch {
    return { ok: false, message: ENGINE_MESSAGES.failed };
  }
  if (response.status === 415) return { ok: false, message: ENGINE_MESSAGES.unsupported };
  if (response.status === 413) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      message: ENGINE_MESSAGES[body.error === "too-long" ? "too-long" : "too-large"],
    };
  }
  if (response.status === 403 || response.status === 429)
    return { ok: false, message: ENGINE_MESSAGES.refused };
  if (!response.ok) return { ok: false, message: ENGINE_MESSAGES.failed };
  const parsed = parseAutopsyReport(await response.json().catch(() => null));
  return parsed.ok
    ? { ok: true, report: parsed.report }
    : { ok: false, message: ENGINE_MESSAGES.failed };
}
