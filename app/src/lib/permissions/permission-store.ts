// EZD-102 Step 9 (vault/plans/EZD-102.md): the browser's copy of the member's permission set. Plain store,
// no React (pattern: app/src/components/states/toast-store.ts). One fetch in flight; refresh calls during
// it set one pending flag, which runs one more fetch after it settles. A success replaces the set (keys
// filtered by isPermissionKey) and notifies only on a content change; a rejected fetch keeps the set and
// notifies nobody (the browser set only hides controls; the server decides, ARCH can()). refresh() never
// rejects: the fetch failure is absorbed here, so a caller that drops the promise (the provider's Realtime
// handlers, dispatched by the hub with no catch) never leaves an unhandled rejection in the browser.
import { isPermissionKey, type PermissionKey } from './catalog';

export type PermissionStore = {
  get(): ReadonlySet<PermissionKey>;
  subscribe(cb: () => void): () => void;
  refresh(): Promise<void>;
};

function sameSet(a: ReadonlySet<PermissionKey>, b: ReadonlySet<PermissionKey>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

export function createPermissionStore(
  initial: readonly PermissionKey[],
  fetchPermissions: () => Promise<readonly PermissionKey[]>,
): PermissionStore {
  let current: ReadonlySet<PermissionKey> = new Set(initial.filter(isPermissionKey));
  const listeners = new Set<() => void>();
  let inFlight: Promise<void> | null = null;
  let pending = false;

  function notify() {
    for (const l of [...listeners]) l();
  }

  async function runOnce(): Promise<void> {
    let keys: readonly PermissionKey[];
    try {
      keys = await fetchPermissions();
    } catch {
      // A rejected fetch (network error, 500, 401 after the session ends, permissions_refused) keeps the
      // set and notifies nobody; the server route is the check, so a stale browser set only hides controls.
      return;
    }
    const next: ReadonlySet<PermissionKey> = new Set(keys.filter(isPermissionKey));
    if (!sameSet(current, next)) {
      current = next;
      notify();
    }
  }

  function start(): Promise<void> {
    const run = runOnce().finally(() => {
      inFlight = null;
      if (pending) {
        pending = false;
        // The one follow-up fetch; nobody awaits it, and runOnce never rejects.
        void start();
      }
    });
    inFlight = run;
    return run;
  }

  function refresh(): Promise<void> {
    if (inFlight) {
      pending = true;
      return inFlight;
    }
    return start();
  }

  return {
    get: () => current,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    refresh,
  };
}
