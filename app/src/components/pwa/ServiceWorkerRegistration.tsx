'use client';
// EZD-013 Step 10 (vault/plans/EZD-013.md): registers the service worker once; renders nothing.
// EZD-134: every same-origin fetch carries the app build from the moment this module loads (version-fetch.ts);
// after a registration the page names what it loaded to the worker and asks for persistent storage
// (warm-message.ts).
import { useEffect } from 'react';
import { registerServiceWorker } from '../../lib/pwa/register-sw';
import { installVersionFetch } from '../../lib/pwa/version-fetch';
import { startWarm } from '../../lib/pwa/warm-message';

if (typeof window !== 'undefined') installVersionFetch(window);

export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    void (async () => {
      if ((await registerServiceWorker()) === 'registered') await startWarm();
    })();
  }, []);
  return null;
}
