/** Detector PWA entry point. */
import "@doppelganger/tokens/tokens.css";
import "./styles/base.css";
import "./styles/states.css";
import { startApp } from "./app.ts";
import { takeSessionToken } from "./features/engine/session-token.ts";

// Served by the local engine: move its launch token out of the address bar first.
takeSessionToken(location, sessionStorage, history);
startApp(import.meta.env.BASE_URL, import.meta.env.MODE);

// Offline support (audio-capture Requirement 6). Not in dev, where files are unbundled.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
}
