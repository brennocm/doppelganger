import { describe, expect, it } from "vitest";
import { loadClips, replayLabel } from "./replay-source.ts";

const ok = (body: unknown) => async () => ({
  ok: true,
  json: async () => body,
  arrayBuffer: async () => new ArrayBuffer(0),
});

const clip = { id: "a", file: "a.ogg", label: "genuine", title: "Author, genuine", seconds: 12 };

describe("loadClips", () => {
  it("keeps valid clips and drops malformed or unsafe entries", async () => {
    const clips = await loadClips(
      "/replay/clips.json",
      ok({
        clips: [
          clip,
          { ...clip, id: "b", label: "maybe" },
          { ...clip, id: "c", file: "../secret.ogg" },
          { ...clip, id: "d", file: "https://example.com/x.ogg" },
          { ...clip, id: "e", seconds: 45 },
        ],
      }),
    );
    expect(clips.map((c) => c.id)).toEqual(["a"]);
  });

  it("returns no clips when the index is missing or invalid", async () => {
    expect(
      await loadClips("/x", async () => ({
        ok: false,
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    ).toEqual([]);
    expect(await loadClips("/x", ok({ clips: "nope" }))).toEqual([]);
    expect(await loadClips("/x", () => Promise.reject(new Error("offline")))).toEqual([]);
  });
});

describe("replayLabel (Requirement 2.3)", () => {
  it("labels replay sessions from the clip metadata", () => {
    expect(replayLabel({ label: "genuine" })).toBe("Replay: genuine");
    expect(replayLabel({ label: "synthetic" })).toBe("Replay: synthetic");
  });
});
