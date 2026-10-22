// Online status from the browser's online and offline events (vault/plans/EZD-015a.md Step 1; 11 rule 11).
// "Offline" is navigator.onLine === false. No timer, request or polling.
import { useSyncExternalStore } from 'react';

export type OnlineSource = {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => boolean;
};

export function createOnlineSource(
  target:
    Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | undefined = globalThis.window,
  nav: { onLine: boolean } | undefined = globalThis.navigator,
): OnlineSource {
  if (!target) {
    return { subscribe: () => () => {}, getSnapshot: () => true };
  }
  return {
    getSnapshot: () => nav?.onLine ?? true,
    subscribe: (cb) => {
      target.addEventListener('online', cb);
      target.addEventListener('offline', cb);
      return () => {
        target.removeEventListener('online', cb);
        target.removeEventListener('offline', cb);
      };
    },
  };
}

const defaultSource = createOnlineSource();

export function useOnline(): boolean {
  return useSyncExternalStore(defaultSource.subscribe, defaultSource.getSnapshot, () => true);
}
