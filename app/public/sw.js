// EZD-013: no offline cache yet. EZD-134 adds the Workbox app-shell cache at this same URL.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
