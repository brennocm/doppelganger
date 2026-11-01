/**
 * Manifest and model loading for the Inference_Worker (audio-capture Requirement 4.2).
 * Both come from the same origin as the manifest URL, and the model's size and SHA-256
 * must match the manifest before ONNX Runtime ever sees the bytes (security steering).
 */
import { type ModelManifest, parseModelManifest } from "@doppelganger/contracts";

export type Fetch = (
  url: string,
) => Promise<Pick<Response, "ok" | "status" | "json" | "arrayBuffer">>;

export class ModelLoadError extends Error {
  override readonly name = "ModelLoadError";
}

export class IntegrityError extends Error {
  override readonly name = "IntegrityError";
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolves only when the bytes have the manifest's size and SHA-256. */
export async function verifyModel(
  bytes: Uint8Array<ArrayBuffer>,
  manifest: ModelManifest,
): Promise<void> {
  if (bytes.byteLength !== manifest.bytes) {
    throw new IntegrityError("model size does not match its manifest");
  }
  if ((await sha256Hex(bytes)) !== manifest.sha256) {
    throw new IntegrityError("model SHA-256 does not match its manifest");
  }
}

export async function fetchManifest(manifestUrl: string, fetchFn: Fetch): Promise<ModelManifest> {
  const response = await fetchFn(manifestUrl);
  if (!response.ok) throw new ModelLoadError(`manifest request failed (${response.status})`);
  const parsed = parseModelManifest(await response.json());
  if (!parsed.ok) throw new ModelLoadError(`invalid manifest: ${parsed.error}`);
  return parsed.manifest;
}

/** The model file next to its manifest; refuses anything that resolves to another origin. */
export function modelUrl(manifest: ModelManifest, manifestUrl: string): string {
  const base = new URL(manifestUrl);
  const url = new URL(manifest.file, base);
  if (url.origin !== base.origin) throw new ModelLoadError("model is not on the manifest's origin");
  return url.href;
}

export async function fetchVerifiedModel(
  manifest: ModelManifest,
  manifestUrl: string,
  fetchFn: Fetch,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetchFn(modelUrl(manifest, manifestUrl));
  if (!response.ok) throw new ModelLoadError(`model request failed (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await verifyModel(bytes, manifest);
  return bytes;
}
