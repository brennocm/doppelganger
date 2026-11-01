/**
 * Replay_Clips (audio-capture Requirement 2.2, 2.3): labelled demo recordings from
 * `replay/clips.json`, played through the same pipeline and out of the speakers.
 */
import { CaptureError, type CaptureSource } from "../capture/sources.ts";

export type ClipLabel = "genuine" | "synthetic";

export interface ReplayClip {
  id: string;
  file: string;
  label: ClipLabel;
  title: string;
  seconds: number;
}

type FetchLike = (url: string) => Promise<Pick<Response, "ok" | "json" | "arrayBuffer">>;

const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(ogg|opus|mp3|wav|flac|m4a|webm)$/;

function isClip(value: unknown): value is ReplayClip {
  const c = value as Partial<ReplayClip> | null;
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    typeof c.file === "string" &&
    SAFE_FILE.test(c.file) &&
    (c.label === "genuine" || c.label === "synthetic") &&
    typeof c.seconds === "number" &&
    c.seconds > 0 &&
    c.seconds < 30
  );
}

/** Valid clips from clips.json; anything malformed is left out. A missing file means none. */
export async function loadClips(indexUrl: string, fetchFn: FetchLike): Promise<ReplayClip[]> {
  try {
    const response = await fetchFn(indexUrl);
    if (!response.ok) return [];
    const data = (await response.json()) as { clips?: unknown };
    return Array.isArray(data.clips) ? data.clips.filter(isClip) : [];
  } catch {
    return [];
  }
}

/** The label shown for the whole session (Requirement 2.3). */
export function replayLabel(clip: Pick<ReplayClip, "label">): string {
  return clip.label === "genuine" ? "Replay: genuine" : "Replay: synthetic";
}

export function replaySource(
  clip: ReplayClip,
  folderUrl: string,
  fetchFn: FetchLike,
): CaptureSource {
  let node: AudioBufferSourceNode | null = null;
  const ended: (() => void)[] = [];
  return {
    kind: "replay",
    async start(ctx) {
      let buffer: AudioBuffer;
      try {
        const response = await fetchFn(new URL(clip.file, folderUrl).href);
        if (!response.ok) throw new Error("clip request failed");
        buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      } catch {
        throw new CaptureError("replay-failed");
      }
      node = ctx.createBufferSource();
      node.buffer = buffer;
      // The viewer hears what is being judged.
      node.connect(ctx.destination);
      node.addEventListener(
        "ended",
        () => {
          for (const cb of ended) cb();
        },
        { once: true },
      );
      node.start();
      return node;
    },
    stop() {
      try {
        node?.stop();
      } catch {
        // Already stopped.
      }
      node?.disconnect();
      // Drop the decoded clip.
      if (node) node.buffer = null;
      node = null;
    },
    onEnded(cb) {
      ended.push(cb);
    },
  };
}
