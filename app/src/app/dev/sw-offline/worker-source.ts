// EZD-164 Step 2 (vault/plans/EZD-164.md D-Worker): the throwaway caching worker, network first, cache second.
import { SW_OFFLINE_CACHE, SW_OFFLINE_SCOPE } from './constants';

export const SW_OFFLINE_WORKER_SOURCE = `const CACHE = '${SW_OFFLINE_CACHE}';
const SCOPE = '${SW_OFFLINE_SCOPE}';
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE) && !url.pathname.startsWith('/_next/static/')) return;
  const onNetwork = (response) => {
    if (response.ok && response.type === 'basic') {
      return caches
        .open(CACHE)
        .then((c) => c.put(request.url, response.clone()))
        .catch(() => undefined)
        .then(() => response);
    }
    return response;
  };
  const onOffline = () =>
    caches
      .open(CACHE)
      .then((c) => c.match(request.url, { ignoreVary: true }))
      .then((hit) => hit || Response.error());
  event.respondWith(fetch(request).then(onNetwork, onOffline));
});
`;
