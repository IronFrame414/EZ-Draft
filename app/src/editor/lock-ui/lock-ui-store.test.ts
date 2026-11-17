// EZD-126 U1-U9 (AC-EZD-126-1 to -7). Expected values: S06 Controls lines 75-81 (banner to every user not holding,
// Request edit -> "Requested", holder prompt with a 5-minute countdown, Available toast to everyone, Start editing
// first press wins, View only while not holding, avatars with the holder marked); Q-0697 decisions 05 (toast to
// every member; Start editing only with Edit model and stays until used; without it 5 s; minutes:seconds
// countdown; own notice for the holder's other device); Q-0058 (a) (TOAST_DEFAULT_MS 5000); Q-0206 (the former
// holder is told); 09o Auto-release row 1 (5 minutes); 11 rule 11 (no polling); MAX_AVATARS 4 (assumption).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToastStore, type ToastStore } from '../../components/states/toast-store';
import type { PeopleResult } from '../../lib/people/people-api';
import type { LockView } from '../lock/lock-controller';
import { createLockUiStore, formatCountdown, MAX_AVATARS, type LockUiDeps } from './lock-ui-store';
import {
  createFakeLockController,
  deferred,
  ready,
  type Deferred,
} from './test-utils/fake-lock-controller';

const ME = '00000000-0000-4000-8000-00000000a001';
const A = '00000000-0000-4000-8000-00000000a002';
const B = '00000000-0000-4000-8000-00000000a003';
const C = '00000000-0000-4000-8000-00000000a004';
const D = '00000000-0000-4000-8000-00000000a005';
const E = '00000000-0000-4000-8000-00000000a006';
const F = '00000000-0000-4000-8000-00000000a007';
const G = '00000000-0000-4000-8000-00000000a008';
const SINCE = '2026-11-11T14:42:00Z';
const HELD_BY_A = { holder: { appUserId: A, name: 'Alex Holder' }, since: SINCE };
const HELD_BY_ME = { holder: { appUserId: ME, name: 'Me Myself' }, since: SINCE };
const NOT_LOADED: LockView = { status: 'loading', lock: null, mine: false };

const timers = {
  setInterval: (r: () => void, ms: number) => setInterval(r, ms),
  clearInterval: (h: unknown) => clearInterval(h as never),
  now: () => Date.now(),
};

function setup(initial: LockView, over: Partial<LockUiDeps> = {}) {
  const fake = createFakeLockController(initial);
  const toasts: ToastStore = createToastStore();
  const people: Deferred<PeopleResult>[] = [];
  const fetchPeople = vi.fn(() => {
    const d = deferred<PeopleResult>();
    people.push(d);
    return d.promise;
  });
  const stops: Deferred<{ ok: true } | { ok: false; code: string }>[] = [];
  const stopEditing = vi.fn(() => {
    const d = deferred<{ ok: true } | { ok: false; code: string }>();
    stops.push(d);
    return d.promise;
  });
  const onLockTaken = vi.fn();
  const onLockLeft = vi.fn();
  const store = createLockUiStore({
    projectId: 'p1',
    viewerId: ME,
    canEditModel: true,
    wasHolding: false,
    controller: fake.controller,
    stopEditing,
    drain: async () => {},
    onLockTaken,
    onLockLeft,
    toasts,
    someone: 'Someone',
    fetchPeople,
    newDeviceId: () => 'device-1',
    timers,
    ...over,
  });
  return { fake, toasts, store, fetchPeople, people, stopEditing, stops, onLockTaken, onLockLeft };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('EZD-126 lock UI store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-11-11T14:42:10Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('EZD-126 U1 formatCountdown is minutes:seconds rounded up', () => {
    const cases: [number, string][] = [
      [300000, '5:00'],
      [299001, '5:00'],
      [299000, '4:59'],
      [239000, '3:59'],
      [61000, '1:01'],
      [59999, '1:00'],
      [1, '0:01'],
      [0, '0:00'],
      [-5000, '0:00'],
      [NaN, '0:00'],
      [86400000, '1440:00'],
    ];
    for (const [ms, text] of cases) expect(formatCountdown(ms), String(ms)).toBe(text);
  });

  it('EZD-126 U2 banner, View only and holder flags follow the lock', () => {
    expect(setup(NOT_LOADED).store.getState()).toMatchObject({
      loaded: false,
      banner: null,
      viewOnly: false,
      isHolder: false,
    });
    expect(setup(ready()).store.getState()).toMatchObject({
      loaded: true,
      banner: null,
      viewOnly: true,
      isHolder: false,
    });
    expect(setup(ready(HELD_BY_A)).store.getState()).toMatchObject({
      banner: { holderId: A, holderName: 'Alex Holder', since: SINCE, request: { kind: 'idle' } },
      viewOnly: true,
      canEdit: true,
    });
    expect(setup(ready(HELD_BY_A), { canEditModel: false }).store.getState()).toMatchObject({
      banner: { holderId: A, request: { kind: 'idle' } },
      canEdit: false,
    });
    expect(setup(ready(HELD_BY_ME)).store.getState()).toMatchObject({
      banner: null,
      viewOnly: false,
      isHolder: true,
    });
    const mine = {
      id: 'r1',
      requestedAt: '2026-11-11T14:43:00Z',
      deadlineAt: '2026-11-11T14:48:00Z',
    };
    expect(
      setup(ready({ ...HELD_BY_A, myRequest: mine })).store.getState().banner?.request,
    ).toEqual({ kind: 'requested', requestedAt: '2026-11-11T14:43:00Z' });
  });

  it('EZD-126 U3 the Available toast: Start editing with Edit model, 5 s without, dismissed when taken', async () => {
    const a = setup(ready(HELD_BY_A));
    a.fake.setLock({ holder: null, since: null });
    const [t] = a.toasts.getSnapshot();
    expect(a.toasts.getSnapshot()).toHaveLength(1);
    expect(t).toMatchObject({
      message: 'office.lock.available',
      params: { name: 'Alex Holder' },
      tone: 'success',
      duration: null,
    });
    expect(t.action?.label).toBe('office.lock.start_editing');
    a.toasts.press(t.id);
    expect(a.fake.calls.startEditing).toHaveLength(1);
    expect(a.fake.calls.startEditing[0].args).toEqual(['device-1']);
    a.fake.calls.startEditing[0].result.resolve({
      ok: true,
      status: 'acquired',
      lockEpoch: 3,
      since: SINCE,
    } as never);
    await flush();
    expect(a.onLockTaken).toHaveBeenCalledTimes(1);

    const b = setup(ready(HELD_BY_A), { canEditModel: false });
    b.fake.setLock({ holder: null, since: null });
    expect(b.toasts.getSnapshot()).toHaveLength(1);
    expect(b.toasts.getSnapshot()[0]).toMatchObject({ action: null, duration: 5000 });
    vi.advanceTimersByTime(5000);
    expect(b.toasts.getSnapshot()).toEqual([]);

    // A free lock at the first read, not held by this tab: Start editing with Edit model, nothing without it.
    for (const c of [
      setup(ready()),
      (() => {
        const d = setup(NOT_LOADED);
        d.fake.setLock({});
        return d;
      })(),
    ]) {
      const list = c.toasts.getSnapshot();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        message: 'office.lock.available_free',
        tone: 'success',
        duration: null,
      });
      expect(list[0].action?.label).toBe('office.lock.start_editing');
    }
    expect(setup(ready(), { canEditModel: false }).toasts.getSnapshot()).toEqual([]);
    const later = setup(NOT_LOADED, { canEditModel: false });
    later.fake.setLock({});
    expect(later.toasts.getSnapshot()).toEqual([]);
    // A lock this tab held at open and that is free now: the Available toast of the release, not a second one.
    const held = setup(NOT_LOADED, { wasHolding: true });
    held.fake.setLock({});
    expect(held.toasts.getSnapshot()).toHaveLength(1);

    const e = setup(ready(HELD_BY_A));
    e.fake.setLock({ holder: null, since: null });
    expect(e.toasts.getSnapshot()).toHaveLength(1);
    e.fake.setLock({ holder: { appUserId: B, name: 'Bea Editor' }, since: SINCE });
    expect(e.toasts.getSnapshot()).toEqual([]);
    expect(e.store.getState().banner?.holderName).toBe('Bea Editor');
  });

  it('EZD-126 U4 the former holder is told why the lock went, except after their own release', async () => {
    const lost = async (
      event: Parameters<ReturnType<typeof setup>['store']['onEvent']>[0],
      next: Parameters<ReturnType<typeof setup>['fake']['setLock']>[0],
      before?: (s: ReturnType<typeof setup>) => void,
    ) => {
      const s = setup(ready(HELD_BY_ME));
      before?.(s);
      s.store.onEvent(event);
      s.fake.setLock(next);
      return s;
    };
    const auto = {
      name: 'lock.auto_released' as const,
      payload: { formerHolderAppUserId: ME, lockEpoch: 2, at: SINCE },
    };
    const released = {
      name: 'lock.released' as const,
      payload: { formerHolderAppUserId: ME, lockEpoch: 2, reason: 'stop_editing', at: SINCE },
    } as never;
    const free = { holder: null, since: null };

    const a = await lost(auto, free);
    expect(a.store.getState().lockLost).toBe('auto');
    expect(a.toasts.getSnapshot().map((t) => t.message)).toEqual(['office.lock.available']);

    const b = await lost(released, free);
    expect(b.store.getState().lockLost).toBe('other_device');
    expect(b.toasts.getSnapshot()).toHaveLength(1);

    const c = await lost(released, free, (s) => void s.store.stopEditing());
    expect(c.stopEditing).toHaveBeenCalledTimes(1);
    expect(c.store.getState().lockLost).toBeNull();
    expect(c.toasts.getSnapshot()).toHaveLength(1);

    const d = await lost(released, free, (s) => {
      s.fake.setLock({
        requests: [
          {
            id: 'r1',
            requesterAppUserId: B,
            requesterName: 'Bea Editor',
            requestedAt: SINCE,
            deadlineAt: '2026-11-11T14:47:00Z',
          },
        ],
      });
      void s.store.release();
    });
    expect(d.fake.calls.release).toHaveLength(1);
    expect(d.store.getState().lockLost).toBeNull();

    const e = await lost(released, { holder: { appUserId: B, name: 'Bea Editor' } });
    expect(e.store.getState().lockLost).toBe('other_device');
    expect(e.toasts.getSnapshot()).toEqual([]);

    a.fake.setLock(HELD_BY_ME);
    expect(a.store.getState().lockLost).toBeNull();
    b.store.closeLockLost();
    expect(b.store.getState().lockLost).toBeNull();

    // Another person's auto release is no notice for this viewer.
    const h = setup(ready(HELD_BY_A));
    h.store.onEvent({ ...auto, payload: { ...auto.payload, formerHolderAppUserId: A } });
    h.fake.setLock(free);
    expect(h.store.getState().lockLost).toBeNull();
    expect(h.toasts.getSnapshot()).toHaveLength(1);

    // The lock UI loads after the open: a lock this tab held at open and that is gone is still told.
    const late = setup(NOT_LOADED, { wasHolding: true });
    late.fake.setLock({ holder: { appUserId: B, name: 'Bea Editor' }, since: SINCE });
    expect(late.store.getState().lockLost).toBe('released');
  });

  it('EZD-126 U5 a Keep by the holder turns the request back to idle with a toast', () => {
    const mine = { id: 'r1', requestedAt: SINCE, deadlineAt: '2026-11-11T14:47:00Z' };
    const s = setup(ready({ ...HELD_BY_A, myRequest: mine }));
    const declined = (requestId: string) => ({
      name: 'lock.request_declined' as const,
      payload: { requestId, requesterAppUserId: ME, respondedAt: SINCE },
    });
    s.store.onEvent(declined('r1'));
    s.fake.setLock({ myRequest: null });
    expect(s.store.getState().banner?.request).toEqual({ kind: 'idle' });
    expect(s.toasts.getSnapshot()).toHaveLength(1);
    expect(s.toasts.getSnapshot()[0]).toMatchObject({
      message: 'office.lock.declined',
      params: { name: 'Alex Holder' },
      duration: 5000,
    });
    // Another person's declined request is not this viewer's.
    s.store.onEvent({
      ...declined('r9'),
      payload: { ...declined('r9').payload, requesterAppUserId: B },
    });
    expect(s.toasts.getSnapshot()).toHaveLength(1);
  });

  it('EZD-126 U6 the holder prompt shows the earliest request with a live countdown, one timer only while shown', () => {
    const s = setup(
      ready({
        ...HELD_BY_ME,
        requests: [
          {
            id: 'r2',
            requesterAppUserId: C,
            requesterName: 'Cy Viewer',
            requestedAt: '2026-11-11T14:42:30Z',
            deadlineAt: '2026-11-11T14:47:30Z',
          },
          {
            id: 'r1',
            requesterAppUserId: B,
            requesterName: 'Bea Editor',
            requestedAt: '2026-11-11T14:42:10Z',
            deadlineAt: '2026-11-11T14:47:10Z',
          },
        ],
      }),
    );
    expect(s.store.getState().prompt).toEqual({
      requestId: 'r1',
      requesterId: B,
      requesterName: 'Bea Editor',
      countdown: '5:00',
      busy: false,
    });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(s.store.getState().prompt?.countdown).toBe('4:59');
    vi.advanceTimersByTime(60000);
    expect(s.store.getState().prompt?.countdown).toBe('3:59');
    s.fake.setLock({ requests: [] });
    expect(s.store.getState().prompt).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    const idle = setup(ready(HELD_BY_ME));
    vi.advanceTimersByTime(600000);
    expect(idle.store.getState().prompt).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('EZD-126 U7 actions ignore a double press and report failures', async () => {
    // (a) Request edit held: one call, busy, then idle.
    const a = setup(ready(HELD_BY_A));
    void a.store.requestEdit();
    void a.store.requestEdit();
    expect(a.fake.calls.requestEdit).toHaveLength(1);
    expect(a.store.getState().banner?.request.kind).toBe('busy');
    a.fake.calls.requestEdit[0].result.resolve({ ok: true, status: 'requested' } as never);
    await flush();
    expect(a.store.getState().banner?.request.kind).toBe('idle');

    // (b) The lock went free first.
    const b = setup(ready(HELD_BY_A));
    void b.store.requestEdit();
    b.fake.calls.requestEdit[0].result.resolve({ ok: true, status: 'lock_free' } as never);
    await flush();
    expect(b.toasts.getSnapshot()[0]).toMatchObject({ message: 'office.lock.available_free' });
    expect(b.toasts.getSnapshot()[0].action?.label).toBe('office.lock.start_editing');

    // (c) Any other failure.
    const c = setup(ready(HELD_BY_A));
    void c.store.requestEdit();
    c.fake.calls.requestEdit[0].result.resolve({ ok: false, code: 'denied' } as never);
    await flush();
    expect(c.toasts.getSnapshot()[0]).toMatchObject({
      message: 'office.lock.action_failed',
      duration: 5000,
    });

    // (d) Someone pressed Start editing first: no toast, no reopen.
    const d = setup(ready());
    void d.store.startEditing();
    d.fake.calls.startEditing[0].result.resolve({
      ok: true,
      status: 'held',
      holder: { appUserId: B, name: 'Bea Editor' },
      since: SINCE,
    } as never);
    await flush();
    // Only the first read's Available toast: no failure toast is added.
    expect(d.toasts.getSnapshot().map((t) => t.message)).toEqual(['office.lock.available_free']);
    expect(d.onLockTaken).not.toHaveBeenCalled();

    // (e) Stop editing held, then failed: Retry presses it again.
    const e = setup(ready(HELD_BY_ME));
    void e.store.stopEditing();
    void e.store.stopEditing();
    expect(e.stopEditing).toHaveBeenCalledTimes(1);
    expect(e.store.getState().stopBusy).toBe(true);
    e.stops[0].resolve({ ok: false, code: 'checkpoint_failed' });
    await flush();
    expect(e.store.getState().stopBusy).toBe(false);
    const [stop] = e.toasts.getSnapshot();
    expect(stop.message).toBe('office.lock.stop_failed');
    expect(stop.action?.label).toBe('common.retry');
    e.toasts.press(stop.id);
    expect(e.stopEditing).toHaveBeenCalledTimes(2);

    // (f) Release refused because the request already ended: no toast. (g) Keep refused while open: toast.
    const req = {
      id: 'r1',
      requesterAppUserId: B,
      requesterName: 'Bea Editor',
      requestedAt: SINCE,
      deadlineAt: '2026-11-11T14:47:10Z',
    };
    const f = setup(ready({ ...HELD_BY_ME, requests: [req] }));
    void f.store.release();
    void f.store.release();
    expect(f.fake.calls.release).toHaveLength(1);
    expect(f.fake.calls.release[0].args[0]).toBe('r1');
    f.fake.setLock({ requests: [] });
    f.fake.calls.release[0].result.resolve({ ok: false, code: 'request_not_pending' } as never);
    await flush();
    expect(f.toasts.getSnapshot()).toEqual([]);
    expect(f.onLockLeft).not.toHaveBeenCalled();

    const g = setup(ready({ ...HELD_BY_ME, requests: [req] }));
    void g.store.keepEditing();
    expect(g.store.getState().prompt?.busy).toBe(true);
    g.fake.calls.keepEditing[0].result.resolve({ ok: false, code: 'denied' } as never);
    await flush();
    expect(g.toasts.getSnapshot()[0].message).toBe('office.lock.action_failed');
    expect(g.store.getState().prompt?.busy).toBe(false);

    // A Release that worked: this tab stops sending edits.
    const r = setup(ready({ ...HELD_BY_ME, requests: [req] }));
    void r.store.release();
    r.fake.calls.release[0].result.resolve({ ok: true, status: 'released', lockEpoch: 3 } as never);
    await flush();
    expect(r.onLockLeft).toHaveBeenCalledTimes(1);

    // (h) Without Edit model there is no Request edit and no Start editing.
    const h = setup(ready(HELD_BY_A), { canEditModel: false });
    await h.store.requestEdit();
    await h.store.startEditing();
    expect(h.fake.calls.requestEdit).toHaveLength(0);
    expect(h.fake.calls.startEditing).toHaveLength(0);
  });

  it('EZD-126 U8 avatars: others only, holder first, capped; names asked on changes only, never on a timer', async () => {
    expect(MAX_AVATARS).toBe(4);
    const s = setup(ready(HELD_BY_A));
    expect(s.fetchPeople).toHaveBeenCalledTimes(0);
    s.store.setPresence([ME, B, A, C, D, E, F]);
    expect(s.fetchPeople).toHaveBeenCalledTimes(1);
    expect(s.fetchPeople.mock.calls[0]).toEqual(['p1', [A, B, C, D]]);
    expect(s.store.getState().avatars).toEqual({
      shown: [
        { appUserId: A, holder: true },
        { appUserId: B, holder: false },
        { appUserId: C, holder: false },
        { appUserId: D, holder: false },
      ],
      overflow: 2,
    });
    s.people[0].resolve({
      ok: true,
      people: [
        { appUserId: A, name: 'Alex Holder', initials: 'AH' },
        { appUserId: B, name: 'Bea Editor', initials: 'BE' },
        { appUserId: D, name: null, initials: 'D' },
      ],
    });
    await flush();
    expect(s.store.getState().people.get(A)).toEqual({ name: 'Alex Holder', initials: 'AH' });
    expect(s.store.getState().people.get(D)).toEqual({ name: null, initials: 'D' });
    // C came back with no row: asked again at the next change, not before.
    s.store.setPresence([ME, B, A, C, D, E, F]);
    expect(s.fetchPeople).toHaveBeenCalledTimes(2);
    expect(s.fetchPeople.mock.calls[1]).toEqual(['p1', [C]]);
    s.people[1].resolve({ ok: false });
    await flush();
    s.store.setPresence([ME, A, G]);
    expect(s.fetchPeople).toHaveBeenCalledTimes(3);
    expect(s.fetchPeople.mock.calls[2]).toEqual(['p1', [G]]);
    expect(s.store.getState().avatars).toEqual({
      shown: [
        { appUserId: A, holder: true },
        { appUserId: G, holder: false },
      ],
      overflow: 0,
    });
    vi.advanceTimersByTime(600000);
    expect(s.fetchPeople).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    // Nobody else in the project: nothing shown.
    s.store.setPresence([ME]);
    expect(s.store.getState().avatars).toEqual({ shown: [], overflow: 0 });
  });

  it('EZD-126 U9 dispose stops the countdown, clears its toasts and ignores late answers', async () => {
    const s = setup(
      ready({
        ...HELD_BY_A,
      }),
    );
    void s.store.requestEdit();
    s.fake.setLock({ holder: null, since: null });
    s.fake.setLock({
      ...HELD_BY_ME,
      requests: [
        {
          id: 'r1',
          requesterAppUserId: B,
          requesterName: 'Bea Editor',
          requestedAt: SINCE,
          deadlineAt: '2026-11-11T14:47:10Z',
        },
      ],
    });
    s.store.onEvent({
      name: 'lock.request_declined',
      payload: { requestId: 'x', requesterAppUserId: ME, respondedAt: SINCE },
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(s.toasts.getSnapshot().length).toBeGreaterThan(0);
    const listener = vi.fn();
    s.store.subscribe(listener);
    s.store.dispose();
    expect(s.toasts.getSnapshot()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(s.fake.listenerCount()).toBe(0);
    s.fake.calls.requestEdit[0].result.resolve({ ok: false, code: 'denied' } as never);
    await flush();
    s.fake.setLock({ holder: null, since: null });
    expect(listener).not.toHaveBeenCalled();
    expect(s.toasts.getSnapshot()).toEqual([]);
  });
});
