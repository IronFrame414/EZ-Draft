// EZD-120b U5 to U8 (vault/plans/EZD-120b.md section 4; AC-EZD-120b-1, -4). Fake timers, an in-memory storage
// and fetch stubs; nothing leaves the process. Expected values: Decided "Drain" (2,000 ms debounce, one fetch
// at a time), "States" (offline, Q-0501), "Failed" (RETRY_DELAYS_MS, `error` from the 3rd failure, Q-0507
// gaps 4, 5), "Refused" (no drain until retry()), "webTabLock" and the ticket row (one drain per user and
// company across tabs).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alwaysLock,
  createMemoryStorage,
  createMutexLock,
  createOnline,
  readCall,
  savedResponse,
  v,
} from '../../../test-harness/outbox/sync-support';
import type { Actor, OutboxStorage } from './outbox';
import { createIdbOutboxStorage } from './outbox-idb';
import { createOutboxSync, webTabLock } from './outbox-sync';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const P = '11111111-1111-4111-8111-111111111111';
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const change = (n: number) => ({ id: idOf(n), value: v(n) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('EZD-120b outbox sync', () => {
  const runU5 = async (releaseBeforeTimer: boolean) => {
    const storage = createMemoryStorage();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inFlight = 0;
    let maxInFlight = 0;
    const calls: number[] = [];
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      const call = await readCall(input, init);
      calls.push(Date.now());
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (calls.length === 1) await held;
      inFlight--;
      return savedResponse(call);
    });
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
    });

    void sync.enqueue(P, 0, [change(1)]);
    await vi.advanceTimersByTimeAsync(1500);
    void sync.enqueue(P, 0, [change(2)]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const first = await readCall(...(fetchImpl.mock.calls[0] as [unknown, RequestInit]));
    expect(first.url).toContain(`/api/projects/${P}/objects`);
    expect(first.method).toBe('POST');
    expect(first.body.changes.map((c) => (c as unknown as { id: string }).id).sort()).toEqual([
      idOf(1),
      idOf(2),
    ]);

    // Held fetch (started at 3,500 ms); a third enqueue at 4,000 ms, whose timer fires at 6,000 ms.
    await vi.advanceTimersByTimeAsync(500);
    void sync.enqueue(P, 0, [change(3)]);
    if (releaseBeforeTimer) {
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      release();
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(calls[1]).toBe(6000);
    } else {
      // The timer fires while the first fetch is still held: no second fetch until it ends.
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      release();
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(calls[1]).toBeGreaterThanOrEqual(7000);
    }
    expect(maxInFlight).toBe(1);
    sync.dispose();
  };

  it('U5 drains 2,000 ms after the last enqueue, the next drain 2,000 ms after a later enqueue', () =>
    runU5(true));

  it('U5 starts no second fetch while one is held past the next drain timer', () => runU5(false));

  it('U6 does not send offline and sends when back online', async () => {
    const storage = createMemoryStorage();
    const online = createOnline(false);
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) =>
      savedResponse(await readCall(input, init)),
    );
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
      online: online.source,
    });
    void sync.enqueue(P, 0, [change(1)]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(sync.getState().status).toBe('offline');
    online.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    sync.dispose();
  });

  it('U7 retries a failed save after 2,000, 4,000 and 8,000 ms and shows an error from the third failure', async () => {
    const storage = createMemoryStorage();
    const times: number[] = [];
    let n = 0;
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      const call = await readCall(input, init);
      times.push(Date.now());
      n++;
      if (n <= 3) throw new TypeError('network down');
      return savedResponse(call);
    });
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
    });
    void sync.enqueue(P, 0, [change(1)]);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sync.getState().status).toBe('pending');
    expect(sync.getState().failures).toBe(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sync.getState().status).toBe('pending');
    expect(sync.getState().failures).toBe(2);

    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sync.getState().status).toBe('error');
    expect(sync.getState().failures).toBe(3);

    await vi.advanceTimersByTimeAsync(7999);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(times).toEqual([2000, 4000, 8000, 16000]);
    expect(sync.getState().status).toBe('saved');
    expect(sync.getState().failures).toBe(0);
    expect(sync.getState().lastSavedAt).not.toBeNull();
    expect(await storage.list()).toEqual([]);
    sync.dispose();
  });

  it('U7 keeps the entries after a refused save, stays quiet and sends again on retry()', async () => {
    const storage = createMemoryStorage();
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: { code: 'save_conflict' } }, { status: 409 }),
    );
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
    });
    void sync.enqueue(P, 0, [change(1)]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sync.getState().status).toBe('error');
    expect(sync.getState().problem).toBe('save_conflict');
    expect(await storage.list()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    sync.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    sync.dispose();
  });

  it('U8 two syncs over one storage and one lock send every entry once and never overlap', async () => {
    const storage = createMemoryStorage();
    const lock = createMutexLock();
    let inFlight = 0;
    let maxInFlight = 0;
    const sentIds: string[] = [];
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      const call = await readCall(input, init);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      inFlight--;
      for (const c of call.body.changes) sentIds.push((c as unknown as { id: string }).id);
      return savedResponse(call);
    });
    const make = () =>
      createOutboxSync({ actor, storage, fetchImpl: fetchImpl as unknown as typeof fetch, lock });
    const a = make();
    const b = make();
    void a.enqueue(P, 0, [change(1)]);
    void b.enqueue(P, 0, [change(2)]);
    await vi.advanceTimersByTimeAsync(20000);
    expect(maxInFlight).toBe(1);
    expect([...sentIds].sort()).toEqual([idOf(1), idOf(2)]);
    expect(await storage.list()).toEqual([]);
    a.dispose();
    b.dispose();
  });

  it('U8 webTabLock asks for an available lock only, and runs without navigator.locks', async () => {
    const request = vi.fn();
    vi.stubGlobal('navigator', { locks: { request } });
    const fn = vi.fn(async () => 'done');

    request.mockImplementation(async (_n: string, _o: unknown, cb: (l: unknown) => unknown) =>
      cb(null),
    );
    expect(await webTabLock().tryRun('ezdraft-outbox:u1:t1', fn)).toEqual({ ran: false });
    expect(fn).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      'ezdraft-outbox:u1:t1',
      { ifAvailable: true },
      expect.any(Function),
    );

    request.mockImplementation(async (_n: string, _o: unknown, cb: (l: unknown) => unknown) =>
      cb({ name: 'ezdraft-outbox:u1:t1' }),
    );
    expect(await webTabLock().tryRun('ezdraft-outbox:u1:t1', fn)).toEqual({
      ran: true,
      value: 'done',
    });
    expect(fn).toHaveBeenCalledTimes(1);

    vi.stubGlobal('navigator', {});
    expect(await webTabLock().tryRun('ezdraft-outbox:u1:t1', fn)).toEqual({
      ran: true,
      value: 'done',
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// EZD-120b U10 (vault/plans/EZD-120b.md section 4; Decided "Storage failure", Q-0596). Fake IndexedDB storage
// wrapped so chosen calls reject; captures are counted on a mock of captureBrowserError.
const capture = vi.hoisted(() => vi.fn());
vi.mock('../errors/capture', () => ({ captureBrowserError: capture }));

function flaky(opts: { rejectPut?: number[]; rejectCommit?: number[] }) {
  globalThis.indexedDB = new IDBFactory();
  const real = createIdbOutboxStorage(actor);
  const calls = { put: [] as unknown[][], commit: [] as unknown[][], order: [] as string[] };
  const storage: OutboxStorage = {
    put: async (...args: Parameters<OutboxStorage['put']>) => {
      calls.put.push(args);
      calls.order.push(`put${calls.put.length}`);
      if (opts.rejectPut?.includes(calls.put.length)) throw new Error('put failed');
      return real.put(...args);
    },
    commit: async (...args: Parameters<OutboxStorage['commit']>) => {
      calls.commit.push(args);
      calls.order.push(`commit${calls.commit.length}`);
      if (opts.rejectCommit?.includes(calls.commit.length)) throw new Error('commit failed');
      return real.commit(...args);
    },
    list: () => real.list(),
    drop: (e) => real.drop(e),
    replaceMirror: (p, o) => real.replaceMirror(p, o),
    close: () => real.close(),
  };
  return { storage, calls };
}

// fake-indexeddb completes its operations with setImmediate, so these tests keep it real and let storage
// settle between timer steps.
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(0);
  }
};

describe('EZD-120b storage failure recovery', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(0);
    capture.mockClear();
  });

  it('U10 (a) keeps failed puts in order and runs them on retry before any fetch', async () => {
    const { storage, calls } = flaky({ rejectPut: [1, 2] });
    const bodies: { changes: { id: string }[] }[] = [];
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      const call = await readCall(input, init);
      bodies.push(call.body as never);
      return Response.json({
        objects: [
          { id: 'A', updatedSeq: 1 },
          { id: 'B', updatedSeq: 1 },
        ],
      });
    });
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
    });
    const seen: string[] = [];
    sync.subscribe((s) => seen.push(s.status));

    await sync.enqueue('p1', 0, [{ id: 'A', value: v(1) }]);
    expect(sync.getState().status).toBe('error');
    expect(sync.getState().problem).toBe('storage_failed');
    await sync.enqueue('p1', 0, [{ id: 'B', value: v(2) }]);
    expect(calls.put).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchImpl).toHaveBeenCalledTimes(0);

    sync.retry();
    await settle();
    expect(calls.put).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(sync.getState().status).toBe('error');
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture.mock.calls.every((c) => c[1] === 'outbox.storage')).toBe(true);

    sync.retry();
    await settle();
    expect(calls.put).toHaveLength(4);
    expect((calls.put[2][2] as { id: string }[]).map((c) => c.id)).toEqual(['A']);
    expect((calls.put[3][2] as { id: string }[]).map((c) => c.id)).toEqual(['B']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(bodies[0].changes.map((c) => c.id).sort()).toEqual(['A', 'B']);
    expect(sync.getState().status).toBe('saved');
    expect(sync.getState().problem).toBeNull();
    expect(await storage.list()).toEqual([]);
    expect(seen.indexOf('saved')).toBeGreaterThan(seen.lastIndexOf('error'));
    sync.dispose();
  });

  it('U10 (b) re-runs a failed commit on retry, so the next save carries baseSeq 7', async () => {
    const { storage, calls } = flaky({ rejectCommit: [1] });
    const bodies: { changes: { id: string; baseSeq: number; data?: { name?: string } }[] }[] = [];
    let n = 0;
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      const call = await readCall(input, init);
      bodies.push(call.body as never);
      n++;
      return Response.json({ objects: [{ id: 'A', updatedSeq: n === 1 ? 7 : 8 }] });
    });
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
    });
    const seen: string[] = [];
    sync.subscribe((s) => seen.push(s.status));

    await sync.enqueue('p1', 0, [{ id: 'A', value: v(1) }]);
    await sync.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sync.getState().status).toBe('error');
    expect(sync.getState().problem).toBe('storage_failed');
    expect(calls.put).toHaveLength(1);

    await sync.enqueue('p1', 0, [{ id: 'A', value: v(2) }]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    sync.retry();
    await settle();
    expect(calls.commit.length).toBeGreaterThanOrEqual(2);
    expect(calls.commit[1][2]).toEqual([{ id: 'A', updatedSeq: 7 }]);
    expect(calls.put).toHaveLength(2);
    expect(calls.order.indexOf('commit2')).toBeGreaterThanOrEqual(0);
    expect(calls.order.indexOf('commit2')).toBeLessThan(calls.order.indexOf('put2'));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodies[1].changes[0].baseSeq).toBe(7);
    expect((bodies[1].changes[0] as { data?: { name?: string } }).data?.name).toBe('F2');
    expect(sync.getState().status).toBe('saved');
    expect(await storage.list()).toEqual([]);
    expect(seen.indexOf('saved')).toBeGreaterThan(seen.lastIndexOf('error'));
    sync.dispose();
  });

  it('U10 (c) a put that fails while the drain waits on storage.list() stops the drain: no fetch, never saved', async () => {
    const { storage: inner } = flaky({ rejectPut: [2] });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let listCalls = 0;
    const storage: OutboxStorage = {
      ...inner,
      list: async () => {
        listCalls++;
        await gate;
        return inner.list();
      },
    };
    const fetchImpl = vi.fn(async () => Response.json({ objects: [{ id: 'A', updatedSeq: 1 }] }));
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lock: alwaysLock,
    });
    const seen: string[] = [];
    sync.subscribe((s) => seen.push(s.status));

    await sync.enqueue('p1', 0, [{ id: 'A', value: v(1) }]);
    void sync.flush();
    await settle();
    expect(listCalls).toBe(1);

    await sync.enqueue('p1', 0, [{ id: 'B', value: v(2) }]);
    expect(sync.getState().problem).toBe('storage_failed');

    release();
    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(seen).not.toContain('saved');
    expect(sync.getState().status).toBe('error');
    expect(sync.getState().problem).toBe('storage_failed');
    sync.dispose();
  });
});
