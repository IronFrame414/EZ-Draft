// EZD-1997 (AC-EZD-1997-1; audit F6, vault/plans/perf-audit-2026-11-26.md; Q-0814): the Realtime hub without
// the Realtime library in a page's first load. Only import() reaches ./index (and so the Supabase Realtime package, through adapter.ts);
// this file imports nothing else from lib/realtime at run time, so a page that uses it downloads the library
// only when loadRealtimeHub() is first called.
import { lazyModule } from '../lazy/lazy-module';
import type { RealtimeHub } from './hub';

const realtimeModule = lazyModule(() => import('./index'));

// The same per-tab hub getRealtimeHub() returns. A failed download rejects; the next call tries again.
export function loadRealtimeHub(): Promise<RealtimeHub> {
  return realtimeModule.load().then((m) => m.getRealtimeHub());
}

type IdleWindow = Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'> & {
  document: Pick<Document, 'readyState'>;
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

// The longest wait for an idle moment once the page has loaded.
export const IDLE_TIMEOUT_MS = 2000;

// Runs `run` once the page has loaded (the window load event, so after first paint) and the browser is idle
// (requestIdleCallback, at most IDLE_TIMEOUT_MS; a zero timer where there is none, as in WebKit). Returns a
// cancel function; after cancel, run is never called.
export function afterPageReady(run: () => void, win: IdleWindow = window): () => void {
  let cancelIdle: (() => void) | null = null;
  const idle = () => {
    win.removeEventListener('load', idle);
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      cancelIdle = () => win.cancelIdleCallback?.(id);
    } else {
      const id = win.setTimeout(run, 0);
      cancelIdle = () => win.clearTimeout(id);
    }
  };
  if (win.document.readyState === 'complete') idle();
  else win.addEventListener('load', idle);
  return () => {
    win.removeEventListener('load', idle);
    cancelIdle?.();
  };
}
