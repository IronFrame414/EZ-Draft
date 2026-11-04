'use client';
// EZD-102 Step 10 (vault/plans/EZD-102.md): the member's permission set in the browser. The server page
// passes the set once as `initial`; the browser refetches GET /api/permissions only after
// user_permission.updated on the user channel or a Realtime resync, never on a timer (AC-EZD-102-4; 11
// rule 11). useCan and Can only hide controls (Q-0214; R24 "hidden"): the server route is the check.
// Patterns: app/src/lib/messages/MessagesProvider.tsx; hub use as app/src/lib/realtime/react.ts.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { getRealtimeHub } from '../realtime';
import { isPermissionKey, type PermissionKey } from './catalog';
import { createPermissionStore, type PermissionStore } from './permission-store';

const PermissionsContext = createContext<PermissionStore | null>(null);

export async function fetchPermissions(): Promise<PermissionKey[]> {
  const res = await fetch('/api/permissions', { cache: 'no-store' });
  if (res.status !== 200) throw new Error('permissions_refused');
  const body = (await res.json()) as { permissions?: unknown };
  const keys = Array.isArray(body.permissions) ? body.permissions : [];
  return keys.filter(isPermissionKey);
}

export function PermissionsProvider({
  initial,
  children,
}: {
  initial: readonly PermissionKey[];
  children: ReactNode;
}) {
  const [store] = useState(() => createPermissionStore(initial, fetchPermissions));
  useEffect(() => {
    const h = getRealtimeHub().user();
    const off1 = h.on('user_permission.updated', () => void store.refresh());
    const off2 = h.onResync(() => store.refresh());
    return () => {
      off1();
      off2();
      h.release();
    };
  }, [store]);
  return <PermissionsContext.Provider value={store}>{children}</PermissionsContext.Provider>;
}

function useStore(): PermissionStore {
  const store = useContext(PermissionsContext);
  if (!store) throw new Error('permissions_provider_missing');
  return store;
}

export function useCan(): (permission: PermissionKey) => boolean {
  const store = useStore();
  const set = useSyncExternalStore(store.subscribe, store.get, store.get);
  return useCallback((k: PermissionKey) => set.has(k), [set]);
}

export function Can({ permission, children }: { permission: PermissionKey; children: ReactNode }) {
  const can = useCan();
  return can(permission) ? <>{children}</> : null;
}
