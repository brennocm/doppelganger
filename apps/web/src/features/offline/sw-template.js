// Service worker for the detector app (audio-capture Requirement 6). The build replaces
// the two placeholders with the precache list and its hash (apps/web/vite.config.ts).
// It caches only same-origin static GET responses; captured audio never reaches it,
// because audio is never fetched (Requirement 6.3).
const PRECACHE = __PRECACHE__;
const CACHE = `doppelganger-${__VERSION__}`;
// Precache requests carry no Origin header, module and worker requests do; servers that
// send "Vary: Origin" would otherwise never match.
const MATCH = { ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new URL(path, self.registration.scope))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("doppelganger-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPage(url) {
  return url.pathname.endsWith("/") || url.pathname.endsWith(".html");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;
  if (isPage(url)) {
    // Network first for the page, so a new build is picked up; the cache when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit ?? caches.match(new URL("./", self.registration.scope))),
        ),
    );
    return;
  }
  // Cache first for hashed assets, ONNX Runtime files and models; precached only.
  event.respondWith(caches.match(request, MATCH).then((hit) => hit ?? fetch(request)));
});
