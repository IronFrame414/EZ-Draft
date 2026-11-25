// EZD-1402 (AC-EZD-1402-1 Offline acceptance test "all queued changes sync as autosaves and one checkpoint version
// follows, with no loss"; 11 Offline; 04 Header card subtitle "Offline, 3 changes queued"). The real IndexedDB
// storage on fake-indexeddb, a controllable online source and a fetch stub answering like the objects and
// checkpoints routes. Expected values: changes made offline wait on the device and are counted; on reconnect
// they are saved through the objects route and exactly one checkpoint of the project follows; an online
// autosave makes no checkpoint; the mark survives a reload of the page.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alwaysLock,
  createOnline,
  readCall,
  savedResponse,
  v,
} from '../../../test-harness/outbox/sync-support';
import type { Actor } from './outbox';
import { createIdbOutboxStorage } from './outbox-idb';
import { createOutboxSync } from './outbox-sync';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const P = '11111111-1111-4111-8111-111111111111';
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const change = (n: number) => ({ id: idOf(n), value: v(n) });

function setup(initiallyOnline: boolean) {
  const storage = createIdbOutboxStorage(actor);
  const online = createOnline(initiallyOnline);
  const saves: string[][] = [];
  const checkpoints: string[] = [];
  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/checkpoints')) {
      checkpoints.push(url);
      return Response.json({ version: { id: 'v1' } }, { status: 201 });
    }
    const call = await readCall(input, init);
    saves.push((call.body.changes as unknown as { id: string }[]).map((c) => c.id));
    return savedResponse(call);
  });
  const make = () =>
    createOutboxSync({
      actor,
      storage,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      online: online.source,
      lock: alwaysLock,
      debounceMs: 5,
    });
  return { storage, online, saves, checkpoints, fetchImpl, make };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('EZD-1402 offline changes sync, then one checkpoint', () => {
  it('AC-EZD-1402-1 three changes made offline are counted, saved on reconnect, then one checkpoint', async () => {
    const c = setup(false);
    const sync = c.make();
    await sync.enqueue(P, 1, [change(1)]);
    await sync.enqueue(P, 1, [change(2)]);
    await sync.enqueue(P, 1, [change(3)]);
    await sync.flush();
    expect(sync.getState().status).toBe('offline');
    expect(sync.getState().queued).toBe(3);
    expect(c.fetchImpl).not.toHaveBeenCalled();
    expect((await c.storage.list()).every((e) => e.offline === true)).toBe(true);

    c.online.set(true);
    await vi.waitFor(() => expect(c.checkpoints).toHaveLength(1));
    expect(c.checkpoints[0]).toBe(`/api/projects/${P}/checkpoints`);
    expect(c.saves.flat().sort()).toEqual([idOf(1), idOf(2), idOf(3)]);
    expect(await c.storage.list()).toEqual([]);
    expect(sync.getState().status).toBe('saved');
    // The checkpoint came after the last save.
    const urls = c.fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(urls[urls.length - 1]).toMatch(/\/checkpoints$/);

    // Later online edits save without another checkpoint.
    await sync.enqueue(P, 1, [change(4)]);
    await sync.flush();
    expect(c.saves.flat()).toContain(idOf(4));
    expect(c.checkpoints).toHaveLength(1);
    sync.dispose();
  });

  it('an online autosave makes no checkpoint', async () => {
    const c = setup(true);
    const sync = c.make();
    await sync.enqueue(P, 1, [change(1)]);
    await sync.flush();
    expect(c.saves).toEqual([[idOf(1)]]);
    expect(c.checkpoints).toEqual([]);
    expect(sync.getState().queued).toBeUndefined();
    sync.dispose();
  });

  it('an online edit of an object changed offline keeps the offline mark', async () => {
    const c = setup(false);
    const sync = c.make();
    await sync.enqueue(P, 1, [change(1)]);
    sync.dispose();
    await c.storage.put(P, 1, [{ id: idOf(1), value: v(9) }], Date.now());
    expect((await c.storage.list())[0]).toMatchObject({ rev: 2, offline: true });
  });

  it('a page opened later sends the offline changes and makes the checkpoint (the mark is on the device)', async () => {
    const c = setup(false);
    const first = c.make();
    await first.enqueue(P, 1, [change(1), change(2)]);
    first.dispose();

    c.online.set(true);
    const second = c.make();
    await second.flush();
    expect(c.saves.flat().sort()).toEqual([idOf(1), idOf(2)]);
    expect(c.checkpoints).toHaveLength(1);
    second.dispose();
  });

  it('a checkpoint that fails is reported and the changes stay saved', async () => {
    const c = setup(false);
    c.fetchImpl.mockImplementation(async (input: unknown, init?: RequestInit) => {
      if (String(input).endsWith('/checkpoints')) return new Response(null, { status: 500 });
      return savedResponse(await readCall(input, init));
    });
    const sync = c.make();
    await sync.enqueue(P, 1, [change(1)]);
    c.online.set(true);
    await vi.waitFor(async () => expect(await c.storage.list()).toEqual([]));
    await sync.flush();
    expect(sync.getState().status).toBe('saved');
    sync.dispose();
  });
});
