// EZD-125 (S06 Edit lock, Controls; Q-0697 decisions 03, 05; ARCH Realtime "Resync", "Requests only on events";
// 11 rule 11): the edit lock state of one open project and the actions EZD-126 binds to its controls (Start
// editing, Request edit, Cancel request, Keep editing, Release). The state is read through the lock route at
// start, after every lock event on the project channel and on every resync of it; no timer, no polling. No
// React.
import type { ProjectChannelEvents } from '../../lib/realtime/events';
import {
  acquireLock,
  cancelRequest,
  fetchLock,
  requestEdit,
  respondRequest,
  type AcquireOutcome,
  type LockState,
  type RequestOutcome,
  type RespondOutcome,
} from '../../lib/lock/lock-client';

export const LOCK_EVENTS = [
  'lock.acquired',
  'lock.released',
  'lock.auto_released',
  'lock.requested',
  'lock.request_declined',
  'lock.request_cancelled',
] as const satisfies readonly (keyof ProjectChannelEvents)[];

export type LockEventName = (typeof LOCK_EVENTS)[number];
export type LockEvent = {
  [K in LockEventName]: { name: K; payload: ProjectChannelEvents[K] };
}[LockEventName];

// A source of the project channel's lock events; `null` is a resync. Returns its stop.
export type LockEventSource = (
  projectId: string,
  cb: (event: LockEvent | null) => void,
) => () => void;

export type LockView = {
  status: 'loading' | 'ready' | 'failed';
  lock: LockState | null;
  // The viewer holds the lock.
  mine: boolean;
};

export type LockController = {
  get(): LockView;
  subscribe(cb: () => void): () => void;
  // Read the lock now; resolves when the read settled (a failed read keeps the last state).
  refresh(): Promise<void>;
  startEditing(deviceId: string): Promise<AcquireOutcome>;
  requestEdit(): Promise<RequestOutcome>;
  cancelRequest(): Promise<{ ok: true } | { ok: false; code: string }>;
  keepEditing(requestId: string): Promise<RespondOutcome>;
  // The holder prompt's Release: the caller's drain runs first (S06 "Release: saves holder's work").
  release(requestId: string, drain: () => Promise<void>): Promise<RespondOutcome>;
  // The message key for a save refused with stale_lock_epoch: the holder's own other device released the
  // lock (Q-0697 decisions 05; 09o lock_epoch row 5), or someone else is editing.
  staleSaveMessageKey(): 'error.lock_released_other_device' | 'error.stale_lock_epoch';
  dispose(): void;
};

export type LockControllerOptions = {
  projectId: string;
  appUserId: string;
  initial?: LockState | null;
  events?: LockEventSource;
  fetchImpl?: typeof fetch;
};

export function createLockController(o: LockControllerOptions): LockController {
  const deps = { fetchImpl: o.fetchImpl ?? fetch };
  const subs = new Set<() => void>();
  let disposed = false;
  let releasedByMe = false;
  const viewOf = (lock: LockState | null, status: LockView['status']): LockView => ({
    status,
    lock,
    mine: lock?.holder?.appUserId === o.appUserId,
  });
  let view: LockView = viewOf(o.initial ?? null, o.initial ? 'ready' : 'loading');
  const set = (next: LockView) => {
    view = next;
    for (const cb of [...subs]) cb();
  };

  async function refresh(): Promise<void> {
    const r = await fetchLock(o.projectId, deps);
    if (disposed) return;
    if (r.ok) set(viewOf(r.lock, 'ready'));
    else if (view.lock === null) set(viewOf(null, 'failed'));
  }

  const onEvent = (event: LockEvent | null) => {
    if (event?.name === 'lock.released') {
      // A release of the viewer's own lock that this tab did not ask for (another tab or device).
      releasedByMe = event.payload.formerHolderAppUserId === o.appUserId;
    } else if (event?.name === 'lock.acquired' || event?.name === 'lock.auto_released') {
      releasedByMe = false;
    }
    void refresh();
  };
  const stop = o.events?.(o.projectId, onEvent);
  if (!o.initial) void refresh();

  return {
    get: () => view,
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    refresh,
    async startEditing(deviceId) {
      const r = await acquireLock(o.projectId, deviceId, deps);
      await refresh();
      return r;
    },
    async requestEdit() {
      const r = await requestEdit(o.projectId, deps);
      await refresh();
      return r;
    },
    async cancelRequest() {
      const r = await cancelRequest(o.projectId, deps);
      await refresh();
      return r;
    },
    async keepEditing(requestId) {
      const r = await respondRequest(o.projectId, requestId, 'keep', deps);
      await refresh();
      return r;
    },
    async release(requestId, drain) {
      await drain();
      const r = await respondRequest(o.projectId, requestId, 'release', deps);
      await refresh();
      return r;
    },
    staleSaveMessageKey: () =>
      releasedByMe ? 'error.lock_released_other_device' : 'error.stale_lock_epoch',
    dispose() {
      disposed = true;
      subs.clear();
      stop?.();
    },
  };
}

// The real source: the Realtime hub's project channel, joined as hubResync joins it (project-defaults.ts: the
// editor route has no room in its first download for the Realtime library, so the channel is joined the first
// time the editor comes back online or back to a visible tab). Each lock event and each resync call `cb`.
export const hubLockEvents: LockEventSource = (projectId, cb) => {
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
        const offs = [
          handle.onResync(() => cb(null)),
          ...LOCK_EVENTS.map((name) =>
            handle.on(name, (payload) => cb({ name, payload } as LockEvent)),
          ),
        ];
        release = () => {
          for (const off of offs) off();
          handle.release();
        };
      })
      .catch(() => {
        /* no hub (a refused start): the lock read of the open stays */
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
