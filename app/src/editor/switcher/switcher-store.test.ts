// EZD-128 S1-S9 (vault/plans/EZD-128.md section 4; AC-EZD-128-1 to -4). Expected values: Decided "Open",
// "Typing" (250 ms debounce, SEARCH_DEBOUNCE_MS; trimmed term; empty → recent at once), "Staleness" (L-048),
// "Fetch answer" and "Retry list" (Q-0214), "Leave" and "Close" (Q-0697 decisions 04: the leave is waited for, a
// failure keeps the lock and shows Retry), "Browser parsing" and "Search" (Q-0698: 8 items; Q-0726: the open
// project left out; `projectsUrl` with status all and sort edited), and `leaveProject` (the holder's Stop
// editing; a pending request cancelled, vault/build/assumptions.md EZD-128 Q-0727 (a)).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LockController } from '../lock/lock-controller';
import {
  createSwitcherStore,
  leaveProject,
  switcherHttpApi,
  type LeaveResult,
  type LeaveSession,
  type SwitcherApi,
  type SwitcherItem,
} from './switcher-store';

const a: SwitcherItem = { id: 'A', name: 'charlie', clientName: 'acme' };
const b: SwitcherItem = { id: 'B', name: 'Alpha', clientName: null };
const stale: SwitcherItem = { id: 'S', name: 'stale', clientName: null };

type Held<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function held<T>(): Held<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function stubApi() {
  const recent = vi.fn<SwitcherApi['recent']>(async () => [a, b]);
  const search = vi.fn<SwitcherApi['search']>(async () => [a]);
  return { recent, search, api: { recent, search } as SwitcherApi };
}

function make(o: { api?: SwitcherApi; leave?: () => Promise<LeaveResult> } = {}) {
  const s = stubApi();
  const leave = vi.fn(o.leave ?? (async (): Promise<LeaveResult> => ({ ok: true })));
  const navigate = vi.fn<(href: string) => void>();
  const store = createSwitcherStore({ projectId: 'P', api: o.api ?? s.api, leave, navigate });
  return { store, leave, navigate, ...s };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('EZD-128 switcher store', () => {
  it('S1 openMenu loads the recent list', async () => {
    const h = held<SwitcherItem[] | null>();
    const { store, recent } = make();
    recent.mockReturnValueOnce(h.promise);
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getState();
    expect(store.getState()).toBe(before);
    expect(before.open).toBe(false);
    store.openMenu();
    expect(store.getState()).toMatchObject({
      open: true,
      mode: 'recent',
      query: '',
      list: { status: 'loading' },
      leaving: { status: 'idle' },
    });
    expect(recent).toHaveBeenCalledTimes(1);
    expect(recent.mock.calls[0][0]).toBe('P');
    h.resolve([a, b]);
    await flush();
    expect(store.getState().list).toEqual({ status: 'ready', items: [a, b] });
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
    const s1 = store.getState();
    expect(store.getState()).toBe(s1);
    store.openMenu();
    expect(recent).toHaveBeenCalledTimes(1);
  });

  it('S2 search waits 250 ms after the last change, trims, and an empty term goes back to recent', async () => {
    vi.useFakeTimers();
    const { store, recent, search } = make();
    store.openMenu();
    await vi.advanceTimersByTimeAsync(0);
    store.setQuery('c');
    vi.advanceTimersByTime(100);
    store.setQuery('ch ');
    expect(store.getState()).toMatchObject({
      mode: 'search',
      term: 'ch',
      list: { status: 'loading' },
    });
    vi.advanceTimersByTime(249);
    expect(search).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe('ch');
    expect(search.mock.calls[0][1]).toBe('P');
    expect(search.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().list).toEqual({ status: 'ready', items: [a] });

    store.setQuery('ch');
    vi.advanceTimersByTime(500);
    expect(search).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ query: 'ch', list: { status: 'ready', items: [a] } });

    store.setQuery('  ');
    expect(store.getState()).toMatchObject({ mode: 'recent', term: '', query: '  ' });
    expect(recent).toHaveBeenCalledTimes(2);
  });

  type Kind = 'R' | 'S';
  type Mutation = 'm1' | 'm2' | 'm3' | 'm4' | 'm5';
  const cells: [Kind, Mutation, boolean][] = [];
  for (const k of ['R', 'S'] as const) {
    for (const m of ['m1', 'm2', 'm3', 'm4', 'm5'] as const) {
      cells.push([k, m, !(k === 'R' && m === 'm2')]);
    }
  }

  it.each(cells)(
    'S3 %s held, then %s: stale answer dropped = %s',
    async (kind, mutation, dropped) => {
      vi.useFakeTimers();
      const h = held<SwitcherItem[] | null>();
      const { store, recent, search } = make();
      let signal: AbortSignal | undefined;
      if (kind === 'R') {
        recent.mockImplementationOnce((_x, s) => {
          signal = s;
          return h.promise;
        });
        store.openMenu();
      } else {
        search.mockImplementationOnce((_t, _x, s) => {
          signal = s;
          return h.promise;
        });
        store.openMenu();
        await vi.advanceTimersByTimeAsync(0);
        store.setQuery('ab');
        vi.advanceTimersByTime(250);
      }
      expect(signal).toBeDefined();
      if (mutation === 'm1') store.setQuery('zz');
      else if (mutation === 'm2') store.setQuery('');
      else if (mutation === 'm3') store.close();
      else if (mutation === 'm4') {
        store.close();
        store.openMenu();
      } else store.dispose();
      h.resolve([stale]);
      await vi.advanceTimersByTimeAsync(0);
      const list = store.getState().list;
      const shown = list.status === 'ready' && list.items.some((i) => i.id === 'S');
      expect(shown).toBe(!dropped);
      expect(signal?.aborted).toBe(dropped);
    },
  );

  it('S4 a failed list shows failed; Retry fetches the current mode at once', async () => {
    vi.useFakeTimers();
    const { store, recent, search } = make();
    recent.mockResolvedValueOnce(null);
    store.openMenu();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().list).toEqual({ status: 'failed' });
    recent.mockResolvedValueOnce([a]);
    store.retryList();
    expect(store.getState().list).toEqual({ status: 'loading' });
    expect(recent).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().list).toEqual({ status: 'ready', items: [a] });

    store.retryList();
    expect(recent).toHaveBeenCalledTimes(2);

    search.mockResolvedValueOnce(null);
    store.setQuery('ch');
    await vi.advanceTimersByTimeAsync(250);
    expect(store.getState().list).toEqual({ status: 'failed' });
    store.retryList();
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls[1][0]).toBe('ch');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().list).toEqual({ status: 'ready', items: [a] });

    recent.mockRejectedValueOnce(new Error('x'));
    store.setQuery('');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().list).toEqual({ status: 'failed' });
  });

  it('S5 a pick waits for the leave before it navigates', async () => {
    const h = held<LeaveResult>();
    const { store, navigate } = make({ leave: () => h.promise });
    store.openMenu();
    const done = store.pick('Q');
    expect(store.getState().leaving).toEqual({
      status: 'busy',
      target: { kind: 'project', projectId: 'Q' },
    });
    await flush();
    expect(navigate).not.toHaveBeenCalled();
    h.resolve({ ok: true });
    await done;
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/projects/Q');

    const back = make();
    back.store.openMenu();
    await back.store.backToProjects();
    expect(back.navigate).toHaveBeenCalledTimes(1);
    expect(back.navigate).toHaveBeenCalledWith('/');

    const closed = make();
    await closed.store.pick('Q');
    expect(closed.leave).not.toHaveBeenCalled();
  });

  it('S6 a failed leave keeps the editor and offers Retry', async () => {
    const results: LeaveResult[] = [{ ok: false, code: 'x' }, { ok: true }];
    const { store, navigate, leave } = make({ leave: async () => results.shift() as LeaveResult });
    store.openMenu();
    await store.pick('Q');
    expect(store.getState().leaving).toEqual({
      status: 'failed',
      target: { kind: 'project', projectId: 'Q' },
    });
    expect(navigate).not.toHaveBeenCalled();
    await store.retryLeave();
    expect(leave).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/projects/Q');

    const thrown = make({
      leave: async () => {
        throw new Error('boom');
      },
    });
    thrown.store.openMenu();
    await thrown.store.backToProjects();
    expect(thrown.store.getState().leaving).toEqual({
      status: 'failed',
      target: { kind: 'projects' },
    });
    expect(thrown.navigate).not.toHaveBeenCalled();
    thrown.store.close();
    expect(thrown.store.getState()).toMatchObject({ open: false, leaving: { status: 'idle' } });
  });

  it('S7 while leaving, every other action is ignored; after dispose nothing navigates', async () => {
    const h = held<LeaveResult>();
    const { store, leave, navigate, recent } = make({ leave: () => h.promise });
    store.openMenu();
    void store.pick('Q');
    void store.pick('R');
    void store.backToProjects();
    store.close();
    store.setQuery('x');
    store.toggle();
    store.retryList();
    expect(leave).toHaveBeenCalledTimes(1);
    expect(recent).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      open: true,
      query: '',
      leaving: { status: 'busy', target: { kind: 'project', projectId: 'Q' } },
    });
    store.dispose();
    h.resolve({ ok: true });
    await flush();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('S8 the http api checks shapes, leaves the open project out and keeps 8 search items', async () => {
    const answers: (() => Response)[] = [
      () => Response.json({ items: [a] }),
      () => Response.json({ items: [{ id: 1 }] }),
      () => Response.json({ items: [a] }, { status: 500 }),
      () => {
        throw new TypeError('offline');
      },
    ];
    const ten = Array.from({ length: 10 }, (_, i) => ({
      id: i === 2 ? 'p' : `X${i}`,
      name: `n${i}`,
      clientName: i % 2 === 0 ? null : `c${i}`,
      address: '1 Main St',
      status: 'draft',
      openItems: 0,
      hasThumbnail: false,
    }));
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url).startsWith('/api/projects?'))
        return Response.json({ items: ten, next: null });
      const next = answers.shift();
      if (!next) throw new Error('no answer');
      return next();
    });
    const api = switcherHttpApi(fetchImpl);
    const signal = new AbortController().signal;
    expect(await api.recent('P', signal)).toEqual([a]);
    expect(await api.recent('P', signal)).toBeNull();
    expect(await api.recent('P', signal)).toBeNull();
    expect(await api.recent('P', signal)).toBeNull();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/projects/recent?exclude=P');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: 'no-store', signal });

    const found = await api.search('ch x', 'P', signal);
    expect(found?.map((i) => i.id)).toEqual(['X0', 'X1', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8']);
    expect(found?.[1]).toEqual({ id: 'X1', name: 'n1', clientName: 'c1' });
    const last = fetchImpl.mock.calls.at(-1);
    expect(last?.[0]).toBe('/api/projects?status=all&sort=edited&q=ch%20x');
    expect(last?.[1]).toMatchObject({ cache: 'no-store', signal });
  });
});

describe('EZD-128 leaveProject', () => {
  type View = ReturnType<LockController['get']>;
  const view = (myRequest: boolean): View => ({
    status: 'ready',
    mine: false,
    lock: {
      lockEpoch: 1,
      holder: { appUserId: 'V', name: 'Vic' },
      since: null,
      offline: false,
      myRequest: myRequest ? { id: 'r', requestedAt: 'x', deadlineAt: 'y' } : null,
      requests: [],
      now: 'z',
    },
  });
  const session = (holding: boolean, controller?: Partial<LockController>) =>
    ({
      model: { project: { id: 'P' }, viewer: { appUserId: 'U' } },
      sync: null,
      queued: async () => [],
      lock: {
        canEditModel: true,
        holding,
        count: 0,
        cleanAt: 0,
        commits: 0,
        stored: 0,
        controller: controller as LockController | undefined,
      },
    }) as unknown as LeaveSession;
  const capture = async () => null;

  it('S9 holder stops editing; a pending request is cancelled; otherwise nothing', async () => {
    const stop = vi.fn<
      (s: unknown, c: unknown) => Promise<{ ok: false; step: 'checkpoint'; code: string }>
    >(async () => ({ ok: false, step: 'checkpoint', code: 'c' }));
    expect(await leaveProject(session(true), capture, async () => ({ stopEditing: stop }))).toEqual(
      {
        ok: false,
        code: 'c',
      },
    );
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop.mock.calls[0][1]).toBe(capture);

    const stopOk = vi.fn(async () => ({ ok: true as const, lockEpoch: 2 }));
    expect(
      await leaveProject(session(true), capture, async () => ({ stopEditing: stopOk })),
    ).toEqual({
      ok: true,
    });

    const never = vi.fn(async () => ({ ok: true as const, lockEpoch: 2 }));
    const load = async () => ({ stopEditing: never });
    const cancelNone = vi.fn(async () => ({ ok: true as const }));
    expect(
      await leaveProject(
        session(false, { get: () => view(false), cancelRequest: cancelNone }),
        capture,
        load,
      ),
    ).toEqual({ ok: true });
    expect(cancelNone).not.toHaveBeenCalled();

    const cancel = vi.fn(async () => ({ ok: false as const, code: 'gone' }));
    expect(
      await leaveProject(
        session(false, { get: () => view(true), cancelRequest: cancel }),
        capture,
        load,
      ),
    ).toEqual({ ok: true });
    expect(cancel).toHaveBeenCalledTimes(1);

    expect(await leaveProject(session(false), capture, load)).toEqual({ ok: true });
    expect(never).not.toHaveBeenCalled();

    const throws = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(
      await leaveProject(session(true), capture, async () => ({ stopEditing: throws })),
    ).toEqual({
      ok: false,
      code: 'leave_failed',
    });
  });
});
