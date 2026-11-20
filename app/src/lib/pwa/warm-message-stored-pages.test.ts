// EZD-134 (11 Offline "cached by the service worker after first load"; architecture "Device storage"): only a page
// the device keeps a copy of (an app shell page or a project page) asks the worker to store what it loaded. Sign-in,
// auth links, invites and dev pages need the network and are never stored, so they start no worker fetches (a
// worker stopped with those fetches in flight took Chromium down in traffic.spec.ts R1).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startWarm } from './warm-message';

const ORIGIN = 'https://ezdraft.example.com';
const P = '00000000-0000-4000-8000-000000000001';

afterEach(() => vi.unstubAllGlobals());

async function warmAt(pathname: string) {
  const postMessage = vi.fn();
  const observe = vi.fn();
  const persist = vi.fn(async () => true);
  vi.stubGlobal('window', { location: { href: `${ORIGIN}${pathname}`, pathname } });
  vi.stubGlobal('performance', { getEntriesByType: () => [] });
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      observe = observe;
    },
  );
  vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist } });
  await startWarm(Promise.resolve({ active: { postMessage } }));
  return { postMessage, observe, persist };
}

describe('EZD-134 warm message on pages the device never stores', () => {
  it.each(['/sign-in', '/sign-in/check-email', '/auth/confirm', '/invite/abc', '/dev/fixtures'])(
    '%s sends the worker nothing and still asks for persistent storage',
    async (pathname) => {
      const { postMessage, observe, persist } = await warmAt(pathname);
      expect(postMessage).not.toHaveBeenCalled();
      expect(observe).not.toHaveBeenCalled();
      expect(persist).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['/', '/settings/defaults', `/projects/${P}`, `/projects/${P}/plan`])(
    '%s names what it loaded to the worker',
    async (pathname) => {
      const { postMessage, observe } = await warmAt(pathname);
      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(observe).toHaveBeenCalledWith({ type: 'resource' });
    },
  );
});
