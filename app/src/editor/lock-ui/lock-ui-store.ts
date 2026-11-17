// EZD-126 (S06 Controls lines 75-81; 12 Edit lock; Q-0697 decisions 03, 05, 10; Q-0058 (a); Q-0206; 09o): what the
// edit lock UI shows, kept in one plain store (no React) over EZD-125's lock controller. The controller holds the
// lock state (read through the lock route on every lock event and resync of the project channel); this store
// derives the banner, the holder prompt, Stop editing, View only and the avatars from it, and turns changes
// into toasts and the lock-lost notice. The events themselves tell why a lock went (auto release, or the
// viewer's own other device or tab) and that a request was declined; they come from the same project channel,
// through `onEvent`. Nothing here runs on a timer but the holder prompt's countdown, which is display only.
import type { ToastStore } from '../../components/states/toast-store';
import type { PeopleResult, Person } from '../../lib/people/people-api';
import type { LockController, LockEvent } from '../lock/lock-controller';

export const MAX_AVATARS = 4;

// m:ss, rounded up to the next whole second; anything not a finite positive number is 0:00.
export function formatCountdown(remainingMs: number): string {
  const s = Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type LockUiTimers = {
  setInterval(run: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
};

type Outcome = { ok: true } | { ok: false; code: string };

export type LockUiDeps = {
  projectId: string;
  viewerId: string;
  // Edit model (Request edit and Start editing need it; Q-0697 decisions 10).
  canEditModel: boolean;
  // This tab held the lock when the project opened: a release seen first by this store is still a change.
  wasHolding: boolean;
  controller: Pick<
    LockController,
    'get' | 'subscribe' | 'startEditing' | 'requestEdit' | 'cancelRequest' | 'keepEditing' | 'release'
  >;
  // Drain, checkpoint, release (EZD-125 session-lock.ts stopEditing).
  stopEditing: () => Promise<Outcome | { ok: false; step: string; code: string }>;
  // The holder's queued work is saved first on Release (S06:76).
  drain: () => Promise<void>;
  // Start editing took the lock: the editor opens again as the holder (tools on, saving with the new epoch).
  onLockTaken: () => void;
  // This tab gave the lock away (Release): its edits are no longer sent.
  onLockLeft: () => void;
  toasts: ToastStore;
  // t('office.lock.someone'): the name in a toast for a person whose name is not known.
  someone: string;
  fetchPeople: (projectId: string, ids: readonly string[]) => Promise<PeopleResult>;
  newDeviceId?: () => string;
  timers?: LockUiTimers;
};

export type RequestUi =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'requested'; requestedAt: string };
export type AvatarView = { appUserId: string; holder: boolean };
// Why this viewer's lock went: the request timer, their own other device or tab, or not known (the change
// happened before the lock UI loaded).
export type LockLost = 'auto' | 'other_device' | 'released';

export type LockUiState = {
  loaded: boolean;
  canEdit: boolean;
  isHolder: boolean;
  viewOnly: boolean;
  banner: { holderId: string; holderName: string | null; since: string; request: RequestUi } | null;
  prompt: {
    requestId: string;
    requesterId: string;
    requesterName: string | null;
    countdown: string;
    busy: boolean;
  } | null;
  stopBusy: boolean;
  avatars: { shown: readonly AvatarView[]; overflow: number };
  lockLost: LockLost | null;
  people: ReadonlyMap<string, Person>;
};

export type LockUiStore = {
  getState(): LockUiState;
  subscribe(listener: () => void): () => void;
  onEvent(event: LockEvent | null): void;
  setPresence(ids: readonly string[]): void;
  requestEdit(): Promise<void>;
  cancelRequest(): Promise<void>;
  startEditing(): Promise<void>;
  release(): Promise<void>;
  keepEditing(): Promise<void>;
  stopEditing(): Promise<void>;
  closeLockLost(): void;
  dispose(): void;
};

const defaultTimers: LockUiTimers = {
  // eslint-disable-next-line no-restricted-globals -- display only, no network
  setInterval: (run, ms) => setInterval(run, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

// Equal when every field the parts draw is equal (`people` is replaced only when names arrive).
function sameState(a: LockUiState, b: LockUiState): boolean {
  const { avatars: aa, people: ap, ...ar } = a;
  const { avatars: ba, people: bp, ...br } = b;
  return ap === bp && JSON.stringify([ar, aa]) === JSON.stringify([br, ba]);
}

const nameOf = (s: string | undefined | null): string | null => (s?.trim() ? s.trim() : null);

export function createLockUiStore(deps: LockUiDeps): LockUiStore {
  const { controller, toasts, viewerId } = deps;
  const timers = deps.timers ?? defaultTimers;
  const listeners = new Set<() => void>();
  let disposed = false;
  let requestBusy = false;
  let promptBusy = false;
  let stopBusy = false;
  let expectRelease = false;
  let pendingCause: LockLost | null = null;
  let lockLost: LockLost | null = null;
  let people: ReadonlyMap<string, Person> = new Map();
  const inFlight = new Set<string>();
  let presence: string[] = [];
  let skew = 0;
  let tick: unknown = null;
  let availableId: string | null = null;
  const shownToasts = new Set<string>();
  // The holder as last seen loaded: undefined before the first loaded state.
  let prevHolder: string | null | undefined = deps.wasHolding ? viewerId : undefined;
  let prevHolderName: string | null = null;

  const lockOf = () => {
    const v = controller.get();
    return v.status === 'ready' ? v.lock : null;
  };

  function show(o: Parameters<ToastStore['show']>[0]): string {
    const id = toasts.show(o);
    shownToasts.add(id);
    return id;
  }

  function showAvailable(name: string | null, free: boolean) {
    if (availableId !== null) toasts.dismiss(availableId);
    const base =
      free || name === null
      ? { message: 'office.lock.available_free' as const }
      : { message: 'office.lock.available' as const, params: { name } };
    availableId = show(
      deps.canEditModel
        ? {
            ...base,
            tone: 'success',
            action: { label: 'office.lock.start_editing', onPress: () => void store.startEditing() },
          }
        : { ...base, tone: 'success' },
    );
  }

  function failed() {
    show({ message: 'office.lock.action_failed' });
  }

  function pickPrompt() {
    const lock = lockOf();
    if (!lock || lock.holder?.appUserId !== viewerId || lock.requests.length === 0) return null;
    return [...lock.requests].sort(
      (a, b) =>
        Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )[0];
  }

  function avatars(holderId: string | null): LockUiState['avatars'] {
    const others: string[] = [];
    for (const id of presence) if (id !== viewerId && !others.includes(id)) others.push(id);
    if (holderId !== null && others.includes(holderId)) {
      others.splice(others.indexOf(holderId), 1);
      others.unshift(holderId);
    }
    const shown = others.slice(0, MAX_AVATARS).map((appUserId) => ({
      appUserId,
      holder: appUserId === holderId,
    }));
    return { shown, overflow: others.length - shown.length };
  }

  function compute(): LockUiState {
    const v = controller.get();
    const lock = v.status === 'ready' ? v.lock : null;
    const loaded = lock !== null;
    const holderId = lock?.holder?.appUserId ?? null;
    const isHolder = loaded && holderId === viewerId;
    const q = pickPrompt();
    return {
      loaded,
      canEdit: deps.canEditModel,
      isHolder,
      viewOnly: loaded && !isHolder,
      banner:
        lock && holderId !== null && holderId !== viewerId && lock.since !== null
          ? {
              holderId,
              holderName: nameOf(lock.holder?.name),
              since: lock.since,
              request: requestBusy
                ? { kind: 'busy' }
                : lock.myRequest
                  ? { kind: 'requested', requestedAt: lock.myRequest.requestedAt }
                  : { kind: 'idle' },
            }
          : null,
      prompt: q
        ? {
            requestId: q.id,
            requesterId: q.requesterAppUserId,
            requesterName: nameOf(q.requesterName),
            countdown: formatCountdown(Date.parse(q.deadlineAt) - (timers.now() + skew)),
            busy: promptBusy,
          }
        : null,
      stopBusy,
      avatars: avatars(holderId),
      lockLost,
      people,
    };
  }

  let state = compute();

  function notify() {
    for (const l of [...listeners]) l();
  }

  // A change that leaves the screen as it was (a resync, a presence sync with the same people) tells nobody, so
  // the editor makes no React commit for it (11 rule 4).
  function update() {
    if (disposed) return;
    const next = compute();
    const changed = !sameState(state, next);
    state = changed ? next : state;
    if (state.prompt && tick === null) {
      tick = timers.setInterval(() => {
        const next = compute();
        if (next.prompt?.countdown !== state.prompt?.countdown) {
          state = next;
          notify();
        }
      }, 1000);
    } else if (!state.prompt && tick !== null) {
      timers.clearInterval(tick);
      tick = null;
    }
    askPeople();
    if (changed) notify();
  }

  // Names for the avatars come from the people route, asked only on a change, never on a timer.
  function askPeople() {
    const ids = state.avatars.shown
      .map((a) => a.appUserId)
      .filter((id) => !people.has(id) && !inFlight.has(id));
    if (ids.length === 0) return;
    for (const id of ids) inFlight.add(id);
    void deps.fetchPeople(deps.projectId, ids).then((r) => {
      for (const id of ids) inFlight.delete(id);
      if (disposed || !r.ok) return;
      const next = new Map(people);
      for (const p of r.people) next.set(p.appUserId, { name: p.name, initials: p.initials });
      people = next;
      state = { ...state, people };
      notify();
    });
  }

  function onLockChange() {
    if (disposed) return;
    const lock = lockOf();
    if (lock) {
      skew = Date.parse(lock.now) - timers.now();
      if (!Number.isFinite(skew)) skew = 0;
      const holder = lock.holder?.appUserId ?? null;
      if (prevHolder !== undefined && prevHolder !== null && holder !== prevHolder) {
        if (prevHolder === viewerId) {
          if (expectRelease) expectRelease = false;
          else lockLost = pendingCause ?? 'released';
        }
        if (holder === null) showAvailable(prevHolderName, false);
        pendingCause = null;
      }
      // The first read (the lock UI loads on the first input) finds the lock free while this tab does not hold it:
      // a member with Edit model gets Start editing, or they would stay view only until a reload (S06:77-78).
      if (prevHolder === undefined && holder === null && deps.canEditModel) showAvailable(null, true);
      if (holder !== null && availableId !== null) {
        toasts.dismiss(availableId);
        availableId = null;
      }
      if (holder === viewerId) lockLost = null;
      prevHolder = holder;
      prevHolderName = nameOf(lock.holder?.name);
    }
    update();
  }

  const unsubscribe = controller.subscribe(onLockChange);

  async function run<T>(call: () => Promise<T>, then: (r: T) => void) {
    const r = await call();
    if (!disposed) then(r);
  }

  const stillOpen = (requestId: string) =>
    lockOf()?.requests.some((q) => q.id === requestId) ?? false;

  const store: LockUiStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onEvent(event) {
      if (disposed || event === null) return;
      if (event.name === 'lock.auto_released' && event.payload.formerHolderAppUserId === viewerId) {
        pendingCause = 'auto';
      } else if (event.name === 'lock.released' && event.payload.formerHolderAppUserId === viewerId) {
        pendingCause = 'other_device';
      } else if (
        event.name === 'lock.request_declined' &&
        event.payload.requesterAppUserId === viewerId
      ) {
        show({
          message: 'office.lock.declined',
          params: { name: state.banner?.holderName ?? deps.someone },
        });
      }
    },
    setPresence(ids) {
      presence = [...ids];
      update();
    },
    async requestEdit() {
      if (!state.banner || !deps.canEditModel || state.banner.request.kind !== 'idle') return;
      requestBusy = true;
      update();
      await run(
        () => controller.requestEdit(),
        (r) => {
          requestBusy = false;
          if (r.ok && r.status === 'lock_free') showAvailable(null, true);
          else if (!r.ok) failed();
          update();
        },
      );
    },
    async cancelRequest() {
      if (state.banner?.request.kind !== 'requested') return;
      requestBusy = true;
      update();
      await run(
        () => controller.cancelRequest(),
        (r) => {
          requestBusy = false;
          if (!r.ok) failed();
          update();
        },
      );
    },
    async startEditing() {
      if (!deps.canEditModel) return;
      const device = deps.newDeviceId?.() ?? crypto.randomUUID();
      await run(
        () => controller.startEditing(device),
        (r) => {
          if (r.ok && r.status === 'acquired') deps.onLockTaken();
          else if (!r.ok) failed();
        },
      );
    },
    async release() {
      const p = state.prompt;
      if (!p || p.busy) return;
      promptBusy = true;
      expectRelease = true;
      update();
      await run(
        () => controller.release(p.requestId, deps.drain),
        (r) => {
          promptBusy = false;
          if (r.ok) deps.onLockLeft();
          else {
            expectRelease = false;
            if (stillOpen(p.requestId)) failed();
          }
          update();
        },
      );
    },
    async keepEditing() {
      const p = state.prompt;
      if (!p || p.busy) return;
      promptBusy = true;
      update();
      await run(
        () => controller.keepEditing(p.requestId),
        (r) => {
          promptBusy = false;
          if (!r.ok && stillOpen(p.requestId)) failed();
          update();
        },
      );
    },
    async stopEditing() {
      if (!state.isHolder || stopBusy) return;
      stopBusy = true;
      expectRelease = true;
      update();
      await run(
        () => deps.stopEditing(),
        (r) => {
          stopBusy = false;
          if (!r.ok) {
            expectRelease = false;
            show({
              message: 'office.lock.stop_failed',
              action: { label: 'common.retry', onPress: () => void store.stopEditing() },
            });
          }
          update();
        },
      );
    },
    closeLockLost() {
      lockLost = null;
      update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      if (tick !== null) timers.clearInterval(tick);
      tick = null;
      for (const id of shownToasts) toasts.dismiss(id);
      listeners.clear();
    },
  };

  // The first state: a lock this tab held at open that is gone is a change; anything else is the baseline.
  onLockChange();
  return store;
}
