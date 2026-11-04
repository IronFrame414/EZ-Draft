// EZD-110b T14 (vault/plans/EZD-110b.md section 4; AC-EZD-110-1, -3, -4): the notification store against a
// fake NotificationApi. Expected values: the plan's T14 row, from Decided D15 and B2. No network.
import { describe, expect, it } from 'vitest';
import type { NotificationCursor, NotificationItem, NotificationPage } from './kinds';
import { createNotificationStore } from './store';
import type { NotificationApi, NotificationState, OpenResult } from './store';

const makeItem = (n: number): NotificationItem => ({
  id: `i${n}`,
  kind: 'render_finished',
  params: {},
  link: '/',
  projectId: null,
  projectName: null,
  clientName: null,
  readAt: null,
  createdAt: `2026-10-29T15:0${n}:00.000Z`,
});
const readItem = (n: number): NotificationItem => ({
  ...makeItem(n),
  readAt: '2026-10-29T15:30:00.000Z',
});
const [i1, i2, i3, i4, i5] = [1, 2, 3, 4, 5].map(makeItem);

type Fetcher = () => Promise<NotificationPage>;
const ok =
  (page: NotificationPage): Fetcher =>
  () =>
    Promise.resolve(page);
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function fakeApi() {
  const fetchers: Fetcher[] = [];
  const opens: Array<() => Promise<OpenResult>> = [];
  const cursors: Array<NotificationCursor | null> = [];
  let markAll: () => Promise<void> = () => Promise.resolve();
  const api: NotificationApi = {
    fetchPage(cursor) {
      cursors.push(cursor);
      const next = fetchers.shift();
      if (!next) return Promise.reject(new Error('unexpected fetchPage'));
      return next();
    },
    open() {
      const next = opens.shift();
      if (!next) return Promise.reject(new Error('unexpected open'));
      return next();
    },
    markAllRead: () => markAll(),
  };
  return {
    api,
    fetchers,
    opens,
    cursors,
    setMarkAll: (fn: () => Promise<void>) => {
      markAll = fn;
    },
  };
}

const ids = (items: readonly NotificationItem[]) => items.map((i) => i.id);

describe('EZD-110b notification store', () => {
  it('EZD-110b T14 the store follows D15 through every step', async () => {
    const f = fakeApi();
    const store = createNotificationStore(f.api);
    const s = () => store.get();
    const byId = (id: string) => s().items.find((i) => i.id === id);

    expect(s()).toEqual({
      status: 'idle',
      items: [],
      unreadCount: 0,
      hasMore: false,
      olderStatus: 'idle',
    });

    // (1)
    f.fetchers.push(ok({ items: [i3, i2], unreadCount: 3, hasMore: true }));
    await store.refresh();
    expect(s().status, 'step 1').toBe('ready');
    expect(ids(s().items), 'step 1').toEqual(['i3', 'i2']);
    expect(s().unreadCount, 'step 1').toBe(3);
    expect(s().hasMore, 'step 1').toBe(true);

    // (2)
    f.fetchers.push(ok({ items: [i2, i1], unreadCount: 3, hasMore: false }));
    await store.loadOlder();
    expect(f.cursors[1], 'step 2').toEqual({ createdAt: i2.createdAt, id: 'i2' });
    expect(ids(s().items), 'step 2').toEqual(['i3', 'i2', 'i1']);
    expect(s().unreadCount, 'step 2').toBe(3);
    expect(s().hasMore, 'step 2').toBe(false);
    expect(s().olderStatus, 'step 2').toBe('idle');

    // (3)
    f.fetchers.push(ok({ items: [i4, i3], unreadCount: 4, hasMore: true }));
    await store.refresh();
    expect(ids(s().items), 'step 3').toEqual(['i4', 'i3', 'i2', 'i1']);
    expect(s().unreadCount, 'step 3').toBe(4);
    expect(s().hasMore, 'step 3').toBe(false);

    // (4)
    store.applyRead('i3');
    expect(byId('i3')?.readAt, 'step 4 first').not.toBeNull();
    expect(s().unreadCount, 'step 4 first').toBe(3);
    store.applyRead('i3');
    expect(s().unreadCount, 'step 4 again').toBe(3);
    store.applyRead('x');
    expect(s().unreadCount, 'step 4 unknown id').toBe(3);

    // (5)
    store.applyRead(null);
    for (const id of ['i4', 'i3', 'i2', 'i1'])
      expect(byId(id)?.readAt, `step 5 ${id}`).not.toBeNull();
    expect(s().unreadCount, 'step 5').toBe(0);

    // (6) reset() keeps the shown list while its fetch is pending (D15, B2)
    let resolve6!: (page: NotificationPage) => void;
    f.fetchers.push(
      () =>
        new Promise<NotificationPage>((resolve) => {
          resolve6 = resolve;
        }),
    );
    const p6 = store.reset();
    await flush();
    expect(s().status, 'step 6 pending').toBe('ready');
    expect(ids(s().items), 'step 6 pending').toEqual(['i4', 'i3', 'i2', 'i1']);
    expect(s().unreadCount, 'step 6 pending').toBe(0);
    expect(s().hasMore, 'step 6 pending').toBe(false);
    resolve6({ items: [i4], unreadCount: 1, hasMore: false });
    await p6;
    expect(s().status, 'step 6').toBe('ready');
    expect(ids(s().items), 'step 6').toEqual(['i4']);
    expect(s().unreadCount, 'step 6').toBe(1);
    expect(s().hasMore, 'step 6').toBe(false);

    // (6b) a refresh with hasMore true after the reset: hasMore true
    f.fetchers.push(ok({ items: [i4], unreadCount: 1, hasMore: true }));
    await store.refresh();
    expect(s().hasMore, 'step 6b').toBe(true);

    // (7) two refresh() while one is in flight: 2 fetches in all
    const before7 = f.cursors.length;
    let release!: () => void;
    f.fetchers.push(
      () =>
        new Promise<NotificationPage>((resolve) => {
          release = () => resolve({ items: [i4], unreadCount: 1, hasMore: false });
        }),
    );
    f.fetchers.push(ok({ items: [i4], unreadCount: 1, hasMore: false }));
    const p1 = store.refresh();
    const p2 = store.refresh();
    const p3 = store.refresh();
    await flush();
    expect(f.cursors.length - before7, 'step 7 while in flight').toBe(1);
    release();
    await Promise.all([p1, p2, p3]);
    expect(f.cursors.length - before7, 'step 7').toBe(2);

    // (8)
    const before8 = f.cursors.length;
    f.opens.push(() => Promise.resolve({ ok: true, link: '/' }));
    const r8 = await store.open('i4');
    expect(r8, 'step 8').toEqual({ ok: true, link: '/' });
    expect(byId('i4')?.readAt, 'step 8').not.toBeNull();
    expect(s().unreadCount, 'step 8').toBe(0);
    expect(f.cursors.length - before8, 'step 8 fetches').toBe(0);

    // (9)
    const before9 = f.cursors.length;
    const notOk: OpenResult = { ok: false, messageKey: 'error.job_not_found' };
    f.opens.push(() => Promise.resolve(notOk));
    f.fetchers.push(ok({ items: [i5, readItem(4)], unreadCount: 1, hasMore: false }));
    const r9 = await store.open('i4');
    // D15: a refused open resolves only after its refetch settled, so the fetch and its result are already in.
    expect(f.cursors.length - before9, 'step 9 fetches').toBe(1);
    expect(r9, 'step 9').toEqual(notOk);
    expect(ids(s().items), 'step 9').toEqual(['i5', 'i4']);
    expect(s().unreadCount, 'step 9').toBe(1);

    // (10)
    const before10 = f.cursors.length;
    f.opens.push(() => Promise.reject(new Error('network')));
    f.fetchers.push(ok({ items: [i5, readItem(4)], unreadCount: 1, hasMore: false }));
    const r10 = await store.open('i5');
    expect(f.cursors.length - before10, 'step 10 fetches').toBe(1);
    expect(r10, 'step 10').toEqual({ ok: false, messageKey: 'error.db_unavailable' });
    expect(ids(s().items), 'step 10').toEqual(['i5', 'i4']);
    expect(s().unreadCount, 'step 10').toBe(1);

    // (11)
    f.setMarkAll(() => Promise.reject(new Error('network')));
    const stateBefore11 = s();
    const r11 = await store.markAllRead();
    expect(r11, 'step 11').toBe(false);
    expect(s(), 'step 11 state').toEqual(stateBefore11);

    // (12)
    f.setMarkAll(() => Promise.resolve());
    const r12 = await store.markAllRead();
    expect(r12, 'step 12').toBe(true);
    expect(byId('i5')?.readAt, 'step 12 i5').not.toBeNull();
    expect(byId('i4')?.readAt, 'step 12 i4').not.toBeNull();
    expect(s().unreadCount, 'step 12').toBe(0);

    // (13)
    f.fetchers.push(() => Promise.reject(new Error('network')));
    await expect(store.refresh()).resolves.toBeUndefined();
    expect(s().status, 'step 13').toBe('error');
  });

  it('EZD-110b T14 step 14 reset on a new store and after a failed refresh (Q-0549)', async () => {
    const deferred = () => {
      let resolve!: (page: NotificationPage) => void;
      let reject!: (e: Error) => void;
      const fetcher: Fetcher = () =>
        new Promise<NotificationPage>((res, rej) => {
          resolve = res;
          reject = rej;
        });
      return {
        fetcher,
        resolve: (p: NotificationPage) => resolve(p),
        reject: (e: Error) => reject(e),
      };
    };

    // (a) reset() on a new store: loading, empty
    {
      const f = fakeApi();
      const store = createNotificationStore(f.api);
      const d = deferred();
      f.fetchers.push(d.fetcher);
      const p = store.reset();
      await flush();
      expect(store.get().status, '14a').toBe('loading');
      expect(ids(store.get().items), '14a').toEqual([]);
      expect(store.get().unreadCount, '14a').toBe(0);
      d.resolve({ items: [i4], unreadCount: 1, hasMore: false });
      await p;
    }

    // (b) refresh ready, then reset() rejecting: error, the list kept
    {
      const f = fakeApi();
      const store = createNotificationStore(f.api);
      f.fetchers.push(ok({ items: [i3, i2], unreadCount: 2, hasMore: true }));
      await store.refresh();
      const d = deferred();
      f.fetchers.push(d.fetcher);
      const p = store.reset();
      await flush();
      d.reject(new Error('network'));
      await expect(p).resolves.toBeUndefined();
      expect(store.get().status, '14b').toBe('error');
      expect(ids(store.get().items), '14b').toEqual(['i3', 'i2']);
      expect(store.get().unreadCount, '14b').toBe(2);
      expect(store.get().hasMore, '14b').toBe(true);
    }
  });

  it('EZD-110b T14 loadOlder returns at once, with no fetch, when blocked (B2)', async () => {
    const PENDING = Symbol('pending');
    const settled = (p: Promise<void>) =>
      Promise.race([p.then(() => 'done'), flush().then(() => PENDING)]);
    const f = fakeApi();
    const store = createNotificationStore(f.api);

    // items empty: resolves at once, no fetch
    expect(await settled(store.loadOlder()), 'empty').toBe('done');
    expect(f.cursors.length, 'empty fetches').toBe(0);

    f.fetchers.push(ok({ items: [i3, i2], unreadCount: 2, hasMore: false }));
    await store.refresh();

    // hasMore false: resolves at once, no fetch
    expect(await settled(store.loadOlder()), 'hasMore false').toBe('done');
    expect(f.cursors.length, 'hasMore false fetches').toBe(1);

    f.fetchers.push(ok({ items: [i3, i2], unreadCount: 2, hasMore: true }));
    await store.refresh();

    // olderStatus loading: the second call resolves while the first fetch is still open
    let release!: () => void;
    f.fetchers.push(
      () =>
        new Promise<NotificationPage>((resolve) => {
          release = () => resolve({ items: [i1], unreadCount: 2, hasMore: false });
        }),
    );
    const first = store.loadOlder();
    await flush();
    expect(store.get().olderStatus, 'loading').toBe('loading');
    const before = f.cursors.length;
    expect(await settled(store.loadOlder()), 'olderStatus loading').toBe('done');
    expect(f.cursors.length, 'loading fetches').toBe(before);
    release();
    await first;
    expect(ids(store.get().items)).toEqual(['i3', 'i2', 'i1']);
  });

  // T14 matrix (plan section 4, D15 version rule; Q-0550). Fresh store per case; each fetchPage call is a deferred.
  describe('EZD-110b T14 matrix', () => {
    const P0: NotificationPage = { items: [i3, i2], unreadCount: 3, hasMore: true };
    const PA: NotificationPage = { items: [i4, i3], unreadCount: 4, hasMore: true };
    const PB: NotificationPage = { items: [i4], unreadCount: 1, hasMore: false };
    const OLDER: NotificationPage = { items: [i1], unreadCount: 3, hasMore: false };
    const CURSOR_I2 = { createdAt: i2.createdAt, id: 'i2' };
    const CURSOR_I3 = { createdAt: i3.createdAt, id: 'i3' };
    const CURSOR_I1 = { createdAt: i1.createdAt, id: 'i1' };
    const modes = ['resolve', 'reject'] as const;
    type Mode = (typeof modes)[number];
    type Fake = ReturnType<typeof fakeApi>;

    // A fetchPage call that stays open until the test settles it. The promise exists up front, so settling is safe
    // at any time; the next fetchPage call takes the next queued deferred.
    function queued(f: Fake) {
      let res!: (page: NotificationPage) => void;
      let rej!: (e: Error) => void;
      const promise = new Promise<NotificationPage>((a, b) => {
        res = a;
        rej = b;
      });
      promise.catch(() => undefined);
      f.fetchers.push(() => promise);
      return { res, rej: () => rej(new Error('network')) };
    }
    type Deferred = ReturnType<typeof queued>;
    const settle = (d: Deferred, mode: Mode, page: NotificationPage) =>
      mode === 'resolve' ? d.res(page) : d.rej();

    async function setup() {
      const f = fakeApi();
      const store = createNotificationStore(f.api);
      f.fetchers.push(ok(P0));
      await store.refresh();
      return { f, store, fetches: () => f.cursors.length - 1 };
    }

    type Expected = {
      ids: string[];
      read?: string[];
      unread: number;
      hasMore: boolean;
      status?: NotificationState['status'];
      olderStatus?: NotificationState['olderStatus'];
    };
    function expectState(label: string, s: NotificationState, e: Expected) {
      expect(ids(s.items), `${label} ids`).toEqual(e.ids);
      for (const item of s.items) {
        const isRead = (e.read ?? []).includes(item.id);
        expect(item.readAt !== null, `${label} ${item.id} read`).toBe(isRead);
      }
      expect(s.unreadCount, `${label} unreadCount`).toBe(e.unread);
      expect(s.hasMore, `${label} hasMore`).toBe(e.hasMore);
      expect(s.status, `${label} status`).toBe(e.status ?? 'ready');
      expect(s.olderStatus, `${label} olderStatus`).toBe(e.olderStatus ?? 'idle');
    }

    const P0_STATE: Expected = { ids: ['i3', 'i2'], unread: 3, hasMore: true };
    const I3_READ: Expected = { ids: ['i3', 'i2'], read: ['i3'], unread: 2, hasMore: true };
    const ALL_READ: Expected = { ids: ['i3', 'i2'], read: ['i3', 'i2'], unread: 0, hasMore: true };
    const PA_STATE: Expected = { ids: ['i4', 'i3'], unread: 4, hasMore: true };
    const PB_STATE: Expected = { ids: ['i4'], unread: 1, hasMore: false };

    // m1: O in flight; a refresh lands (PA); then O settles and is stale
    for (const mode of modes) {
      it(`EZD-110b T14 m1 ${mode}`, async () => {
        const { f, store, fetches } = await setup();
        const dO = queued(f);
        const pO = store.loadOlder();
        await flush();
        expect(f.cursors[1], 'm1 older cursor').toEqual(CURSOR_I2);
        const dR = queued(f);
        const pR = store.refresh();
        await flush();
        dR.res(PA);
        await pR;
        settle(dO, mode, OLDER);
        await pO;
        await flush();
        expectState('m1 mid', store.get(), PA_STATE);
        expectState('m1 end', store.get(), PA_STATE);
        expect(fetches(), 'm1 fetches').toBe(2);
        const dN = queued(f);
        const pN = store.loadOlder();
        await flush();
        expect(f.cursors[3], 'm1 new loadOlder cursor').toEqual(CURSOR_I3);
        dN.res({ items: [], unreadCount: 4, hasMore: false });
        await pN;
      });
    }

    // m2: O in flight; reset(); the reset fetch lands (PA); same when the reset fetch settles before O
    for (const mode of modes) {
      for (const order of ['older first', 'reset first'] as const) {
        it(`EZD-110b T14 m2 ${mode}${order === 'reset first' ? ' (reset fetch settles before O)' : ''}`, async () => {
          const { f, store, fetches } = await setup();
          const dO = queued(f);
          const pO = store.loadOlder();
          await flush();
          const dReset = queued(f);
          const pReset = store.reset();
          expectState('m2 right after reset', store.get(), P0_STATE);
          await flush();
          if (order === 'older first') {
            settle(dO, mode, OLDER);
            await pO;
            await flush();
            expectState('m2 mid', store.get(), P0_STATE);
            dReset.res(PA);
            await pReset;
          } else {
            dReset.res(PA);
            await pReset;
            settle(dO, mode, OLDER);
            await pO;
          }
          await flush();
          expectState('m2 end', store.get(), PA_STATE);
          expect(fetches(), 'm2 fetches').toBe(2);
        });
      }
    }

    // m3: O started after a refresh rejected (status 'error', items kept); reset()
    for (const mode of modes) {
      it(`EZD-110b T14 m3 ${mode}`, async () => {
        const { f, store, fetches } = await setup();
        f.fetchers.push(() => Promise.reject(new Error('network')));
        await store.refresh();
        expectState('m3 after failed refresh', store.get(), { ...P0_STATE, status: 'error' });
        const dO = queued(f);
        const pO = store.loadOlder();
        await flush();
        const dReset = queued(f);
        const pReset = store.reset();
        await flush();
        settle(dO, mode, OLDER);
        await pO;
        await flush();
        expectState('m3 mid', store.get(), { ...P0_STATE, status: 'loading' });
        dReset.res(PB);
        await pReset;
        await flush();
        expectState('m3 end', store.get(), PB_STATE);
        expect(fetches(), 'm3 fetches').toBe(3);
      });
    }

    // m4-m7: O in flight; a read change; O settles and is stale
    const olderCases: Array<{
      n: string;
      change: (store: ReturnType<typeof createNotificationStore>, f: Fake) => Promise<void>;
      expected: Expected;
    }> = [
      { n: 'm4', change: async (store) => store.applyRead('i3'), expected: I3_READ },
      { n: 'm5', change: async (store) => store.applyRead(null), expected: ALL_READ },
      {
        n: 'm6',
        change: async (store) => {
          expect(await store.markAllRead(), 'm6 markAllRead').toBe(true);
        },
        expected: ALL_READ,
      },
      {
        n: 'm7',
        change: async (store, f) => {
          f.opens.push(() => Promise.resolve({ ok: true, link: '/' }));
          expect(await store.open('i3'), 'm7 open').toEqual({ ok: true, link: '/' });
        },
        expected: I3_READ,
      },
    ];
    for (const c of olderCases) {
      for (const mode of modes) {
        it(`EZD-110b T14 ${c.n} ${mode}`, async () => {
          const { f, store, fetches } = await setup();
          const dO = queued(f);
          const pO = store.loadOlder();
          await flush();
          await c.change(store, f);
          settle(dO, mode, OLDER);
          await pO;
          await flush();
          expectState(`${c.n} mid`, store.get(), c.expected);
          expectState(`${c.n} end`, store.get(), c.expected);
          expect(fetches(), `${c.n} fetches`).toBe(1);
        });
      }
    }

    // m8-m12: F (a refresh) in flight; a change; F settles stale; one follow-up fetch
    const READ_I3_PAGE: NotificationPage = {
      items: [i4, readItem(3)],
      unreadCount: 3,
      hasMore: true,
    };
    const READ_I3_PAGE_1: NotificationPage = {
      items: [i4, readItem(3)],
      unreadCount: 1,
      hasMore: true,
    };
    const I3_READ_END: Expected = { ids: ['i4', 'i3'], read: ['i3'], unread: 3, hasMore: true };
    const I3_READ_END_1: Expected = { ids: ['i4', 'i3'], read: ['i3'], unread: 1, hasMore: true };
    const followCases: Array<{
      n: string;
      change: (store: ReturnType<typeof createNotificationStore>, f: Fake) => Promise<() => void>;
      mid: Expected;
      page: NotificationPage;
      end: Expected;
    }> = [
      {
        n: 'm8',
        change: async (store) => {
          let settledReset = false;
          void store.reset().then(() => {
            settledReset = true;
          });
          return () => expect(settledReset, 'm8 reset promise settled').toBe(true);
        },
        mid: P0_STATE,
        page: PB,
        end: PB_STATE,
      },
      {
        n: 'm9',
        change: async (store) => {
          store.applyRead('i3');
          return () => undefined;
        },
        mid: I3_READ,
        page: READ_I3_PAGE,
        end: I3_READ_END,
      },
      {
        n: 'm10',
        change: async (store) => {
          store.applyRead(null);
          return () => undefined;
        },
        mid: ALL_READ,
        page: READ_I3_PAGE_1,
        end: I3_READ_END_1,
      },
      {
        n: 'm11',
        change: async (store) => {
          expect(await store.markAllRead(), 'm11 markAllRead').toBe(true);
          return () => undefined;
        },
        mid: ALL_READ,
        page: READ_I3_PAGE_1,
        end: I3_READ_END_1,
      },
      {
        n: 'm12',
        change: async (store, f) => {
          f.opens.push(() => Promise.resolve({ ok: true, link: '/' }));
          expect(await store.open('i3'), 'm12 open').toEqual({ ok: true, link: '/' });
          return () => undefined;
        },
        mid: I3_READ,
        page: READ_I3_PAGE,
        end: I3_READ_END,
      },
    ];
    for (const c of followCases) {
      for (const mode of modes) {
        it(`EZD-110b T14 ${c.n} ${mode}`, async () => {
          const { f, store, fetches } = await setup();
          const dF = queued(f);
          const dFollow = queued(f);
          const pF = store.refresh();
          await flush();
          const check = await c.change(store, f);
          settle(dF, mode, P0);
          await flush();
          expectState(`${c.n} mid`, store.get(), c.mid);
          dFollow.res(c.page);
          await pF;
          await flush();
          expectState(`${c.n} end`, store.get(), c.end);
          check();
          expect(fetches(), `${c.n} fetches`).toBe(2);
        });
      }
    }

    // m13, m14: F in flight; more refresh calls / a refused open; one follow-up fetch (PA)
    const m13Mid = (mode: Mode): Expected =>
      mode === 'resolve' ? P0_STATE : { ...P0_STATE, status: 'loading' };
    for (const mode of modes) {
      it(`EZD-110b T14 m13 ${mode}`, async () => {
        const { f, store, fetches } = await setup();
        const dF = queued(f);
        const dFollow = queued(f);
        const done = [false, false, false];
        const track = (i: number, p: Promise<void>) => void p.then(() => (done[i] = true));
        track(0, store.refresh());
        await flush();
        track(1, store.refresh());
        track(2, store.refresh());
        settle(dF, mode, P0);
        await flush();
        expectState('m13 mid', store.get(), m13Mid(mode));
        expect(done, 'm13 all three pending').toEqual([false, false, false]);
        dFollow.res(PA);
        await flush();
        expectState('m13 end', store.get(), PA_STATE);
        expect(done, 'm13 all three settled').toEqual([true, true, true]);
        expect(fetches(), 'm13 fetches').toBe(2);
      });
      it(`EZD-110b T14 m14 ${mode}`, async () => {
        const { f, store, fetches } = await setup();
        const dF = queued(f);
        const dFollow = queued(f);
        const pF = store.refresh();
        await flush();
        const notOk: OpenResult = { ok: false, messageKey: 'error.job_not_found' };
        f.opens.push(() => Promise.resolve(notOk));
        let opened: OpenResult | undefined;
        void store.open('i3').then((r) => {
          opened = r;
        });
        await flush();
        settle(dF, mode, P0);
        await flush();
        expectState('m14 mid', store.get(), m13Mid(mode));
        expect(opened, 'm14 open pending').toBeUndefined();
        dFollow.res(PA);
        await pF;
        await flush();
        expectState('m14 end', store.get(), PA_STATE);
        expect(opened, 'm14 open result').toEqual(notOk);
        expect(fetches(), 'm14 fetches').toBe(2);
      });
    }

    // m15, m16: no fetch in flight; O settled (loaded [i3, i2, i1]); a refresh replaces or merges
    async function loadedThroughOlder() {
      const t = await setup();
      const dO = queued(t.f);
      const pO = t.store.loadOlder();
      await flush();
      dO.res(OLDER);
      await pO;
      expectState('loaded through older', t.store.get(), {
        ids: ['i3', 'i2', 'i1'],
        unread: 3,
        hasMore: false,
      });
      return t;
    }
    it('EZD-110b T14 m15', async () => {
      const { f, store, fetches } = await loadedThroughOlder();
      const dR = queued(f);
      const pR = store.refresh();
      await flush();
      dR.res({ items: [i5, i4], unreadCount: 5, hasMore: true });
      await pR;
      expectState('m15 end', store.get(), { ids: ['i5', 'i4'], unread: 5, hasMore: true });
      expect(fetches(), 'm15 fetches').toBe(2);
    });
    it('EZD-110b T14 m16', async () => {
      const { f, store, fetches } = await loadedThroughOlder();
      const dR = queued(f);
      const pR = store.refresh();
      await flush();
      dR.res(PA);
      await pR;
      expectState('m16 end', store.get(), {
        ids: ['i4', 'i3', 'i2', 'i1'],
        unread: 4,
        hasMore: false,
      });
      expect(fetches(), 'm16 fetches').toBe(2);
    });

    // m17, m18: no fetch in flight; O rejected (olderStatus 'error'); a reset or refresh replaces
    async function olderRejected() {
      const t = await setup();
      const dO = queued(t.f);
      const pO = t.store.loadOlder();
      await flush();
      dO.rej();
      await pO;
      expectState('after rejected older', t.store.get(), { ...P0_STATE, olderStatus: 'error' });
      return t;
    }
    it('EZD-110b T14 m17', async () => {
      const { f, store, fetches } = await olderRejected();
      const dR = queued(f);
      const pR = store.reset();
      await flush();
      dR.res(PB);
      await pR;
      expectState('m17 end', store.get(), PB_STATE);
      expect(fetches(), 'm17 fetches').toBe(2);
    });
    it('EZD-110b T14 m18', async () => {
      const { f, store, fetches } = await olderRejected();
      const dR = queued(f);
      const pR = store.refresh();
      await flush();
      dR.res({ items: [i4, i3], unreadCount: 4, hasMore: false });
      await pR;
      expectState('m18 end', store.get(), { ids: ['i4', 'i3'], unread: 4, hasMore: false });
      expect(fetches(), 'm18 fetches').toBe(2);
    });

    // m19: O1 settled with hasMore true, O2 in flight (cursor i1); a refresh (PA) merges, then O2 settles stale
    for (const mode of modes) {
      it(`EZD-110b T14 m19 ${mode}`, async () => {
        const { f, store, fetches } = await setup();
        const dO1 = queued(f);
        const pO1 = store.loadOlder();
        await flush();
        dO1.res({ items: [i1], unreadCount: 3, hasMore: true });
        await pO1;
        const dO2 = queued(f);
        const pO2 = store.loadOlder();
        await flush();
        expect(f.cursors[2], 'm19 O2 cursor').toEqual(CURSOR_I1);
        const dR = queued(f);
        const pR = store.refresh();
        await flush();
        dR.res(PA);
        await pR;
        settle(dO2, mode, { items: [], unreadCount: 3, hasMore: false });
        await pO2;
        await flush();
        const merged: Expected = { ids: ['i4', 'i3', 'i2', 'i1'], unread: 4, hasMore: true };
        expectState('m19 mid', store.get(), merged);
        expectState('m19 end', store.get(), merged);
        expect(fetches(), 'm19 fetches').toBe(3);
        const dN = queued(f);
        const pN = store.loadOlder();
        await flush();
        expect(f.cursors[4], 'm19 new loadOlder cursor').toEqual(CURSOR_I1);
        dN.res({ items: [], unreadCount: 4, hasMore: false });
        await pN;
      });
    }
  });
});
