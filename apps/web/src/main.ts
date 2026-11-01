/** Detector PWA entry point. */
import "@doppelganger/tokens/tokens.css";
import "./styles/base.css";
import "./styles/states.css";
import { startApp } from "./app.ts";

startApp(import.meta.env.BASE_URL, import.meta.env.MODE);

// Offline support (audio-capture Requirement 6). Not in dev, where files are unbundled.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
}
