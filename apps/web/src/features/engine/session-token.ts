/**
 * Session_Token handover (local-runtime Requirement 2.2): the engine prints a launch URL
 * with `#token=…`. The app moves it to sessionStorage and removes it from the address bar,
 * so it is not left in the URL, history or a screenshot. The fragment is never sent to a
 * server.
 */

export const TOKEN_KEY = "doppelganger.engineToken";
const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type HistoryLike = Pick<History, "replaceState">;
type LocationLike = Pick<Location, "hash" | "pathname" | "search">;

/** Takes the token from the fragment if present; returns the stored token, if any. */
export function takeSessionToken(
  location: LocationLike,
  storage: StorageLike,
  history: HistoryLike,
): string | null {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const fromUrl = params.get("token");
  if (fromUrl !== null) {
    // Always clean the address bar, even when the value is not a valid token.
    params.delete("token");
    const rest = params.toString();
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}${rest ? `#${rest}` : ""}`,
    );
    if (TOKEN.test(fromUrl)) {
      try {
        storage.setItem(TOKEN_KEY, fromUrl);
      } catch {
        return fromUrl;
      }
    }
  }
  try {
    const stored = storage.getItem(TOKEN_KEY);
    return stored !== null && TOKEN.test(stored) ? stored : null;
  } catch {
    return null;
  }
}
