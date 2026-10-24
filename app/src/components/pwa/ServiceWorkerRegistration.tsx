'use client';
// EZD-013 Step 10 (vault/plans/EZD-013.md): registers the service worker once; renders nothing.
import { useEffect } from 'react';
import { registerServiceWorker } from '../../lib/pwa/register-sw';

export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
