// EZD-1997 (AC-EZD-1997-1; audit F6, vault/plans/perf-audit-2026-11-26.md): the bell fetches its count at mount
// and downloads Realtime only when the page is loaded and idle. startNotificationBell with the real store, a
// counting fake fetchPage, a fake hub loader and a hand-run scheduler. Expected counts: the bell's mount fetch and
// first-join resync (EZD-110b D16, EZD-318 D1) are its two requests, unchanged by this ticket.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNotificationStore } from '../../lib/notifications/store';
import type { NotificationApi } from '../../lib/notifications/store';
import type { UserHandle } from '../../lib/realtime/hub';
import { startNotificationBell } from './NotificationBell';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const emptyPage = { items: [], unreadCount: 0, hasMore: false };

function makeBell(opts: { loadFails?: number } = {}) {
  let fetchCalls = 0;
  const api: NotificationApi = {
    fetchPage: () => {
      fetchCalls++;
      return Promise.resolve({ ...emptyPage, unreadCount: 3 });
    },
    open: () => Promise.resolve({ ok: true, link: '/' }),
    markAllRead: () => Promise.resolve(),
  };
  const store = createNotificationStore(api);
  let resolveReady: (v: 'subscribed' | 'refused') => void = () => {};
  const ready = new Promise<'subscribed' | 'refused'>((r) => {
    resolveReady = r;
  });
  const handlers = new Map<string, (p: unknown) => void>();
  let resyncCb: () => void = () => {};
  let releases = 0;
  const h = {
    status: 'connecting',
    ready,
    on: (event: string, cb: (p: unknown) => void) => {
      handlers.set(event, cb);
      return () => handlers.delete(event);
    },
    onResync: (cb: () => void) => {
      resyncCb = cb;
      return () => {};
    },
    onStatus: () => () => {},
    release: () => {
      releases++;
    },
  } as unknown as UserHandle;

  let loads = 0;
  let failsLeft = opts.loadFails ?? 0;
  const loadResolvers: Array<() => void> = [];
  const loadHub = () => {
    loads++;
    if (failsLeft > 0) {
      failsLeft--;
      return Promise.reject(new Error('chunk_failed'));
    }
    return new Promise<{ user(): UserHandle }>((resolve) =>
      loadResolvers.push(() => resolve({ user: () => h })),
    );
  };
  let scheduled: (() => void) | null = null;
  let cancelled = 0;
  const schedule = (run: () => void) => {
    scheduled = run;
    return () => {
      cancelled++;
    };
  };
  let readyCalls = 0;
  const bell = startNotificationBell(store, {
    loadHub,
    schedule,
    onReady: () => {
      readyCalls++;
    },
  });
  return {
    store,
    bell,
    fire: () => scheduled?.(),
    resolveLoad: async () => {
      loadResolvers.shift()?.();
      await flush();
    },
    resolveReady,
    resync: () => resyncCb(),
    emit: (event: string, p: unknown = {}) => handlers.get(event)?.(p),
    handlerCount: () => handlers.size,
    fetchCalls: () => fetchCalls,
    loads: () => loads,
    releases: () => releases,
    cancelled: () => cancelled,
    readyCalls: () => readyCalls,
  };
}

describe('EZD-1997 the bell loads Realtime after the page is usable', () => {
  it('fetches the count at mount and downloads nothing until the scheduled moment', async () => {
    const b = makeBell();
    await flush();
    expect(b.fetchCalls()).toBe(1);
    expect(b.store.get().unreadCount).toBe(3);
    expect(b.loads()).toBe(0);
    expect(b.handlerCount()).toBe(0);
  });

  it('wires the user channel once the hub has loaded: the first-join resync is the second fetch, events refetch', async () => {
    const b = makeBell();
    await flush();
    b.fire();
    expect(b.loads()).toBe(1);
    await b.resolveLoad();
    expect(b.handlerCount()).toBe(2);
    expect(b.fetchCalls()).toBe(1);
    b.resync();
    await flush();
    expect(b.fetchCalls()).toBe(2);
    b.emit('notification.created');
    await flush();
    expect(b.fetchCalls()).toBe(3);
  });

  it('reports ready only when the channel has joined, never when it was refused', async () => {
    const joined = makeBell();
    joined.fire();
    await joined.resolveLoad();
    expect(joined.readyCalls()).toBe(0);
    joined.resolveReady('subscribed');
    await flush();
    expect(joined.readyCalls()).toBe(1);

    const refused = makeBell();
    refused.fire();
    await refused.resolveLoad();
    refused.resolveReady('refused');
    await flush();
    expect(refused.readyCalls()).toBe(0);
  });

  it('a bell gone before the hub arrives never takes a channel; stop cancels the schedule and releases', async () => {
    const early = makeBell();
    early.fire();
    early.bell.stop();
    await early.resolveLoad();
    expect(early.handlerCount()).toBe(0);
    expect(early.releases()).toBe(0);
    expect(early.cancelled()).toBe(1);

    const wired = makeBell();
    wired.fire();
    await wired.resolveLoad();
    wired.bell.stop();
    expect(wired.handlerCount()).toBe(0);
    expect(wired.releases()).toBe(1);
  });

  it('a failed download keeps the count; retry (the panel opens) loads again, once', async () => {
    const b = makeBell({ loadFails: 1 });
    await flush();
    b.fire();
    await flush();
    expect(b.loads()).toBe(1);
    expect(b.handlerCount()).toBe(0);
    expect(b.store.get().unreadCount).toBe(3);
    b.bell.retry();
    b.bell.retry();
    expect(b.loads()).toBe(2);
    await b.resolveLoad();
    expect(b.handlerCount()).toBe(2);
    b.bell.retry();
    expect(b.loads()).toBe(2);
  });

  it('the bell and the appraiser link reach the Realtime library only through import()', () => {
    const read = (p: string) => readFileSync(path.resolve(__dirname, p), 'utf8');
    const staticImports = (src: string) =>
      [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
    for (const file of [
      './NotificationBell.tsx',
      '../property-record/PropertyAppraiserLink.tsx',
      '../property-record/read-channel.ts',
    ]) {
      const value = staticImports(read(file)).filter(
        (s) => s.includes('lib/realtime') && s !== '../../lib/realtime/deferred',
      );
      expect(value, file).toEqual([]);
    }
    const deferred = staticImports(read('../../lib/realtime/deferred.ts'));
    expect(deferred.filter((s) => s.startsWith('./'))).toEqual([]);
  });
});
