// EZD-126 test helper: a lock controller whose state the test sets and whose actions answer only when the test
// resolves them, so held calls can be checked (L-062).
import type { LockState } from '../../../lib/lock/lock-client';
import type { LockController, LockView } from '../../lock/lock-controller';

export type Deferred<T> = { promise: Promise<T>; resolve(v: T): void };

export function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type Actions = 'startEditing' | 'requestEdit' | 'cancelRequest' | 'keepEditing' | 'release';
type Call = { args: unknown[]; result: Deferred<never> };

export const FREE: LockState = {
  lockEpoch: 1,
  holder: null,
  since: null,
  offline: false,
  myRequest: null,
  requests: [],
  now: '2026-11-11T14:42:10Z',
};

export function createFakeLockController(initial: LockView) {
  let view = initial;
  const listeners = new Set<() => void>();
  const calls: Record<Actions, Call[]> = {
    startEditing: [],
    requestEdit: [],
    cancelRequest: [],
    keepEditing: [],
    release: [],
  };
  const act =
    (name: Actions) =>
    (...args: unknown[]) => {
      const result = deferred<never>();
      calls[name].push({ args, result });
      return result.promise;
    };
  const controller = {
    get: () => view,
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    startEditing: act('startEditing'),
    requestEdit: act('requestEdit'),
    cancelRequest: act('cancelRequest'),
    keepEditing: act('keepEditing'),
    release: act('release'),
  } satisfies Pick<LockController, 'get' | 'subscribe' | Actions>;
  return {
    controller,
    calls,
    // Replaces the lock (a new object) and tells every listener.
    setLock(partial: Partial<LockState>) {
      const base = view.lock ?? FREE;
      const lock = { ...base, ...partial };
      view = { status: 'ready', lock, mine: false };
      for (const l of [...listeners]) l();
    },
    listenerCount: () => listeners.size,
  };
}

export const ready = (partial: Partial<LockState> = {}): LockView => ({
  status: 'ready',
  lock: { ...FREE, ...partial },
  mine: false,
});
