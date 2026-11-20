// EZD-122 (S20 Events emitted; Q-0700 03 "Revert ... broadcasts so viewers reload"): version.reverted and
// version.snapshot_named on the project channel. A revert reloads every open editor of the project; a new snapshot
// name refreshes the Versions panel. The hub starts as hubVersionSent starts it (version-sent.ts: on the first online
// or visible event, so the editor's first paint loads no Realtime code).
import type { ProjectChannelEvents } from '../../lib/realtime/events';

export type VersionEventHandlers = {
  onReverted: (payload: ProjectChannelEvents['version.reverted']) => void;
  onNamed: (payload: ProjectChannelEvents['version.snapshot_named']) => void;
};

export type VersionEventSource = (projectId: string, h: VersionEventHandlers) => () => void;

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function revertedOf(payload: unknown): ProjectChannelEvents['version.reverted'] | null {
  const p = payload as Partial<ProjectChannelEvents['version.reverted']> | null;
  return p && isId(p.modelVersionId) && isId(p.fromVersionId)
    ? { modelVersionId: p.modelVersionId, fromVersionId: p.fromVersionId }
    : null;
}

export function namedOf(payload: unknown): ProjectChannelEvents['version.snapshot_named'] | null {
  const p = payload as Partial<ProjectChannelEvents['version.snapshot_named']> | null;
  return p && isId(p.modelVersionId) ? { modelVersionId: p.modelVersionId } : null;
}

export const hubVersionEvents: VersionEventSource = (projectId, h) => {
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
    void import('../../lib/realtime')
      .then(({ getRealtimeHub }) => {
        if (closed) return;
        const handle = getRealtimeHub().project(projectId);
        const offReverted = handle.on('version.reverted', (payload) => {
          const p = revertedOf(payload);
          if (p !== null) h.onReverted(p);
        });
        const offNamed = handle.on('version.snapshot_named', (payload) => {
          const p = namedOf(payload);
          if (p !== null) h.onNamed(p);
        });
        release = () => {
          offReverted();
          offNamed();
          handle.release();
        };
      })
      .catch(() => {
        /* no hub (a refused start): the panel refreshes when it opens */
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
