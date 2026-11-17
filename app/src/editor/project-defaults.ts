// EZD-116 (Q-0697 decisions 03 "Defaults data"; AC-EZD-116-8; ARCH Realtime "Resync"): the open project's
// effective defaults. They arrive with the model load and are re-read from GET /api/projects/<id>/defaults on
// every project channel resync (there is no tenant Realtime topic), never on a timer (11 rule 11). No React.
import type { EffectiveDefaults } from '../lib/defaults/values';

// Calls `cb` on every resync of the project channel; returns the unsubscribe.
export type ResyncSource = (projectId: string, cb: () => void) => () => void;

export type ProjectDefaults = {
  get(): EffectiveDefaults;
  subscribe(cb: () => void): () => void;
  // Re-read now; resolves when the read settled (a failed read keeps the values).
  refresh(): Promise<void>;
  dispose(): void;
};

export function createProjectDefaults(o: {
  projectId: string;
  initial: EffectiveDefaults;
  resync?: ResyncSource;
  fetchImpl?: typeof fetch;
}): ProjectDefaults {
  let current = o.initial;
  let disposed = false;
  const subs = new Set<() => void>();
  const fetchImpl = o.fetchImpl ?? fetch;

  const refresh = async () => {
    try {
      const res = await fetchImpl(`/api/projects/${encodeURIComponent(o.projectId)}/defaults`, {
        cache: 'no-store',
      });
      if (res.status !== 200 || disposed) return;
      const body = (await res.json()) as { defaults?: EffectiveDefaults };
      if (disposed || !body.defaults) return;
      if (JSON.stringify(body.defaults) === JSON.stringify(current)) return;
      current = body.defaults;
      for (const cb of [...subs]) cb();
    } catch {
      /* offline or refused: keep the values until the next resync */
    }
  };

  const off = o.resync ? o.resync(o.projectId, () => void refresh()) : null;

  return {
    get: () => current,
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    refresh,
    dispose() {
      disposed = true;
      subs.clear();
      off?.();
    },
  };
}

// The real source: the Realtime hub's project channel. The editor route has no room in its 500,000-byte
// download for the Realtime library (11 Budgets), and the load's values are fresh at open, so the channel is
// joined the first time the editor comes back online or back to a visible tab (when a change may have been
// missed); its first resync re-reads, and so does every later one (vault/build/assumptions.md EZD-116).
export const hubResync: ResyncSource = (projectId, cb) => {
  let release: (() => void) | null = null;
  let closed = false;
  let started = false;
  const onVisible = () => {
    if (document.visibilityState === 'visible') start();
  };
  const detach = () => {
    window.removeEventListener('online', start);
    document.removeEventListener('visibilitychange', onVisible);
  };
  function start() {
    if (started || closed) return;
    started = true;
    detach();
    void import('../lib/realtime')
      .then(({ getRealtimeHub }) => {
        if (closed) return;
        const handle = getRealtimeHub().project(projectId);
        const offResync = handle.onResync(cb);
        release = () => {
          offResync();
          handle.release();
        };
      })
      .catch(() => {
        /* no hub (a refused start): the load's values stay */
      });
  }
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', start);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    closed = true;
    detach();
    release?.();
  };
};
