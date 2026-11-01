/** Detector PWA entry point. */
import { startApp } from "./app.ts";

startApp(import.meta.env.BASE_URL);

// Offline support (audio-capture Requirement 6). Not in dev, where files are unbundled.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  });
}
