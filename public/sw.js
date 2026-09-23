// Minimal service worker: exists only to satisfy the browser's "Add to Home Screen"
// installability criteria. Sajra is a small, frequently-updated app, so this
// deliberately does not cache anything — every request just falls through to the network.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let the browser handle every request normally.
});
