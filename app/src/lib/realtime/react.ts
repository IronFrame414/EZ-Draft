// EZD-018 Step 5 item 7 (vault/plans/EZD-018.md): React bindings. useProjectChannel acquires on mount and
// releases on unmount; usePresence re-renders only the components that read presence. No React render per
// message: consumers that need event data choose their own store.
'use client';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { getRealtimeHub, type PresenceMember, type ProjectHandle } from './index';

// The handle is acquired when React subscribes (after mount) and released when it unsubscribes (unmount or
// a new projectId); React re-reads the snapshot after subscribing, so the handle reaches the component.
export function useProjectChannel(projectId: string): ProjectHandle | null {
  const current = useRef<ProjectHandle | null>(null);
  const subscribe = useCallback(
    (cb: () => void) => {
      const h = getRealtimeHub().project(projectId);
      current.current = h;
      cb();
      return () => {
        h.release();
        if (current.current === h) current.current = null;
      };
    },
    [projectId],
  );
  const getSnapshot = useCallback(() => current.current, []);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

const NO_MEMBERS: PresenceMember[] = [];

export function usePresence(projectId: string): PresenceMember[] {
  const handle = useProjectChannel(projectId);
  const cache = useRef<{ key: string; value: PresenceMember[] }>({ key: '', value: NO_MEMBERS });
  const subscribe = useCallback(
    (cb: () => void) => (handle ? handle.onPresence(cb) : () => {}),
    [handle],
  );
  const getSnapshot = useCallback(() => {
    if (!handle) return NO_MEMBERS;
    const value = handle.presence();
    const key = value.map((m) => m.appUserId).join(',');
    if (key !== cache.current.key) cache.current = { key, value };
    return cache.current.value;
  }, [handle]);
  return useSyncExternalStore(subscribe, getSnapshot, () => NO_MEMBERS);
}
