// Minimal service worker — no-op so GET /sw.js returns 200.
// Register elsewhere if you need offline/cache behavior.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
