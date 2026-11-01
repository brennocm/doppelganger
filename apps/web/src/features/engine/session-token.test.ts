import { describe, expect, it } from "vitest";
import { TOKEN_KEY, takeSessionToken } from "./session-token.ts";

const TOKEN = "a".repeat(20) + "-_" + "B".repeat(21);

function env(hash: string) {
  const data = new Map<string, string>();
  const calls: string[] = [];
  return {
    data,
    calls,
    location: { hash, pathname: "/app/", search: "?x=1" },
    storage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    },
    history: {
      replaceState: (_s: unknown, _t: string, url?: string | URL | null) =>
        void calls.push(String(url)),
    },
  };
}

describe("takeSessionToken (local-runtime 2.2)", () => {
  it("moves the token from the fragment to sessionStorage and cleans the URL", () => {
    const e = env(`#token=${TOKEN}`);
    expect(takeSessionToken(e.location, e.storage, e.history)).toBe(TOKEN);
    expect(e.data.get(TOKEN_KEY)).toBe(TOKEN);
    expect(e.calls).toEqual(["/app/?x=1"]);
  });

  it("keeps other fragment parameters", () => {
    const e = env(`#token=${TOKEN}&view=autopsy`);
    takeSessionToken(e.location, e.storage, e.history);
    expect(e.calls).toEqual(["/app/?x=1#view=autopsy"]);
  });

  it("cleans the URL but stores nothing for a malformed token", () => {
    const e = env("#token=<script>");
    expect(takeSessionToken(e.location, e.storage, e.history)).toBeNull();
    expect(e.data.size).toBe(0);
    expect(e.calls).toHaveLength(1);
  });

  it("returns a token stored earlier in this tab and leaves the URL alone", () => {
    const e = env("");
    e.data.set(TOKEN_KEY, TOKEN);
    expect(takeSessionToken(e.location, e.storage, e.history)).toBe(TOKEN);
    expect(e.calls).toEqual([]);
  });
});
