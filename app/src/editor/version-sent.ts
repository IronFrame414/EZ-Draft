// EZD-121 (S20 Events emitted; Q-0700 05): version.sent on the project channel moves the header to
// "Working copy · Version N sent" for everyone with the project open. The hub starts the way hubResync starts it
// (project-defaults.ts: on the first online or visible event, so the editor's first paint loads no Realtime
// code); the sender's own header moves from the send response.
import type { ProjectChannelEvents } from '../lib/realtime/events';

export type VersionSentSource = (projectId: string, cb: (versionNo: number) => void) => () => void;

export function versionSentOf(payload: unknown): number | null {
  const n = (payload as Partial<ProjectChannelEvents['version.sent']> | null)?.versionNo;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? n : null;
}

export const hubVersionSent: VersionSentSource = (projectId, cb) => {
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
        const off = handle.on('version.sent', (payload) => {
          const n = versionSentOf(payload);
          if (n !== null) cb(n);
        });
        release = () => {
          off();
          handle.release();
        };
      })
      .catch(() => {
        /* no hub (a refused start): the load's number stays */
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
