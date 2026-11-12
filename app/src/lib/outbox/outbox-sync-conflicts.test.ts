// EZD-299b T4a-T4g (vault/plans/EZD-299b.md section 4; AC-EZD-299-16, -17, -18, -4, -2). Fake timers at time 0
// (so refusedAt is 0), the in-memory storage and fetch stubs; nothing leaves the process. Expected values:
// Decided D-Settle (a refusal for good moves the change to the list and the drain goes on; other codes block),
// D-Record (one record call per project and chunk at the end of the drain, caps of EZD-299a), D-Server and
// D-Resolves, as the plan's section 4 rows word them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alwaysLock,
  createMemoryStorage,
  createOnline,
  readCall,
  savedResponse,
  v,
} from '../../../test-harness/outbox/sync-support';

vi.mock('../errors/capture', () => ({ captureBrowserError: vi.fn() }));

import { captureBrowserError } from '../errors/capture';
import type { Actor, DeviceConflict } from './outbox';
import { createOutboxSync } from './outbox-sync';

const actor: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };
const P = '11111111-1111-4111-8111-111111111111';
const Q = '22222222-2222-4222-8222-222222222222';
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type Body = {
  lockEpoch?: number;
  changes: { id: string; baseSeq: number }[];
  resolves?: string[];
};
type Seen = { url: string; method: string; headers: Headers; body: Body };

const isObjects = (s: Seen) =>
  s.method === 'POST' && /\/api\/projects\/[^/]+\/objects$/.test(s.url);
const isRecord = (s: Seen) =>
  s.method === 'POST' && /\/api\/projects\/[^/]+\/sync-conflicts$/.test(s.url);
const isDelete = (s: Seen) => s.method === 'DELETE' && s.url.includes('/api/sync-conflicts/');
const projectOf = (s: Seen) => s.url.split('/')[3];

type Answer = Response | Promise<Response>;
function stub(answer: (s: Seen, index: number) => Answer) {
  const seen: Seen[] = [];
  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const call = await readCall(input, init);
    const s: Seen = {
      url: call.url,
      method: call.method,
      headers: new Headers(input instanceof Request ? input.headers : init?.headers),
      body: call.body as unknown as Body,
    };
    seen.push(s);
    return answer(s, seen.length - 1);
  });
  return { seen, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const recordedIds = (s: Seen) =>
  Response.json({ ids: s.body.changes.map((_, i) => `S${i + 1}`) }, { status: 201 });
const refuse = (status: number, code: string, extra: object = {}) =>
  Response.json({ error: { code }, ...extra }, { status });

function build(storage: ReturnType<typeof createMemoryStorage>, fetchImpl: typeof fetch) {
  return createOutboxSync({ actor, storage, fetchImpl, lock: alwaysLock });
}

const put = (storage: ReturnType<typeof createMemoryStorage>, project: string, ids: number[]) =>
  storage.put(
    project,
    0,
    ids.map((n) => ({ id: idOf(n), value: v(n) })),
    10,
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.mocked(captureBrowserError).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('EZD-299b outbox sync conflicts', () => {
  it('EZD-299b T4a a save conflict and a schema-check refusal leave the outbox and the rest saves', async () => {
    const storage = createMemoryStorage();
    await put(storage, P, [1, 2, 3]);
    const { seen, fetchImpl } = stub((s) => {
      if (isRecord(s)) return recordedIds(s);
      const n = seen.filter(isObjects).length;
      if (n === 1)
        return refuse(409, 'save_conflict', { conflicts: [{ id: idOf(1), serverSeq: 5 }] });
      if (n === 2)
        return refuse(400, 'invalid_object', {
          invalid: [{ id: idOf(2), issue: 'invalid_data' }],
        });
      return savedResponse({ url: s.url, method: s.method, body: s.body as never });
    });
    const sync = build(storage, fetchImpl);
    await sync.flush();

    const posts = seen.filter(isObjects);
    expect(posts.map((s) => s.body.changes.map((c) => c.id))).toEqual([
      [idOf(1), idOf(2), idOf(3)],
      [idOf(2), idOf(3)],
      [idOf(3)],
    ]);
    const rows = await storage.listConflicts();
    expect(rows.map((r) => [r.objectId, r.reason])).toEqual([
      [idOf(1), 'conflict'],
      [idOf(2), 'invalid'],
    ]);
    expect(rows[0].serverSeq).toBe(5);
    expect(await storage.list()).toEqual([]);
    expect(sync.getState().status).toBe('saved');
    expect(sync.getState().problem).toBeNull();
    expect(sync.getState().conflictRev).toBeGreaterThan(0);
    await vi.waitFor(() => expect(captureBrowserError).toHaveBeenCalledTimes(1));
    const [error, where] = vi.mocked(captureBrowserError).mock.calls[0];
    expect((error as Error).message).toBe('invalid_object');
    expect(where).toBe('outbox.invalid_object');
    sync.dispose();
  });

  const projectWide = async (status: number, code: string) => {
    const storage = createMemoryStorage();
    await put(
      storage,
      P,
      Array.from({ length: 101 }, (_, i) => i + 1),
    );
    await storage.put(P, 0, [{ id: idOf(102), value: null }], 10);
    await put(storage, Q, [200]);
    const { seen, fetchImpl } = stub((s) => {
      if (isRecord(s)) return recordedIds(s);
      if (isObjects(s) && projectOf(s) === P) return refuse(status, code);
      return savedResponse({ url: s.url, method: s.method, body: s.body as never });
    });
    const sync = build(storage, fetchImpl);
    await sync.flush();
    return { storage, seen, sync };
  };

  it('EZD-299b T4b a 403 moves every change of the project, drops the unsent delete, and the other project saves', async () => {
    const { storage, seen, sync } = await projectWide(403, 'permission_denied');
    const rows = await storage.listConflicts();
    expect(rows).toHaveLength(101);
    expect(new Set(rows.map((r) => r.reason))).toEqual(new Set(['not_editable']));
    expect(rows.some((r) => r.objectId === idOf(102))).toBe(false);
    expect((await storage.list()).map((e) => e.id)).toEqual([]);
    expect(seen.filter((s) => isObjects(s) && projectOf(s) === P)).toHaveLength(1);
    expect(seen.filter((s) => isObjects(s) && projectOf(s) === P)[0].body.changes).toHaveLength(
      100,
    );
    expect(seen.filter((s) => isObjects(s) && projectOf(s) === Q)).toHaveLength(1);
    sync.dispose();
  });

  it('EZD-299b T4b a 404 moves the project as not_open on the device only', async () => {
    const { storage, seen, sync } = await projectWide(404, 'project_not_found');
    const rows = await storage.listConflicts();
    expect(rows).toHaveLength(101);
    expect(new Set(rows.map((r) => r.reason))).toEqual(new Set(['not_open']));
    expect(new Set(rows.map((r) => r.server))).toEqual(new Set(['device']));
    expect(seen.filter((s) => s.url.includes(`/api/projects/${P}/`))).toHaveLength(1);
    expect(seen.filter(isRecord).filter((s) => projectOf(s) === P)).toEqual([]);
    expect(seen.filter((s) => isObjects(s) && projectOf(s) === Q)).toHaveLength(1);
    expect(await storage.list()).toEqual([]);
    sync.dispose();
  });

  it.each([
    ['stale_lock_epoch', 409, {}],
    ['not_signed_in', 401, {}],
    ['invalid_input', 400, {}],
    ['save_conflict', 409, { conflicts: [{ id: idOf(99), serverSeq: 1 }] }],
    ['app_outdated', 409, {}],
  ] as const)('EZD-299b T4c %s blocks as before and nothing moves', async (code, status, extra) => {
    const storage = createMemoryStorage();
    await put(storage, P, [1]);
    const { seen, fetchImpl } = stub(() => refuse(status, code, extra));
    const sync = build(storage, fetchImpl);
    await sync.flush();

    expect(sync.getState().problem).toBe(code);
    expect(sync.getState().status).toBe('error');
    expect((await storage.list()).map((e) => e.id)).toEqual([idOf(1)]);
    expect(await storage.listConflicts()).toEqual([]);
    expect(seen.filter(isRecord)).toEqual([]);
    const before = seen.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(seen).toHaveLength(before);
    sync.dispose();

    if (code === 'app_outdated') {
      // A reload: a new sync over the same storage, now answered 200.
      const second = stub((s) =>
        savedResponse({ url: s.url, method: s.method, body: s.body as never }),
      );
      const again = build(storage, second.fetchImpl);
      await again.flush();
      expect(second.seen.filter(isObjects)).toHaveLength(1);
      expect(await storage.list()).toEqual([]);
      again.dispose();
    }
  });

  it('EZD-299b T4d makes one record call per project at the end of the drain, with the membership header', async () => {
    const storage = createMemoryStorage();
    await put(storage, P, [1, 2, 3]);
    await put(storage, Q, [4]);
    const { seen, fetchImpl } = stub((s) => {
      if (isRecord(s)) return recordedIds(s);
      const n = seen.filter(isObjects).length;
      if (n === 1)
        return refuse(409, 'save_conflict', { conflicts: [{ id: idOf(1), serverSeq: 5 }] });
      if (n === 2)
        return refuse(400, 'invalid_object', {
          invalid: [{ id: idOf(2), issue: 'invalid_data' }],
        });
      if (n === 4) return refuse(403, 'permission_denied');
      return savedResponse({ url: s.url, method: s.method, body: s.body as never });
    });
    const sync = build(storage, fetchImpl);
    await sync.flush();

    const records = seen.filter(isRecord);
    expect(records).toHaveLength(2);
    const change = (n: number, reason: string) => ({
      id: idOf(n),
      baseSeq: 0,
      reason,
      deleted: false,
      type: v(n).type,
      schemaVersion: v(n).schemaVersion,
      data: v(n).data,
    });
    expect(records[0].url).toContain(`/api/projects/${P}/sync-conflicts`);
    expect(records[0].body).toStrictEqual({
      changes: [change(1, 'conflict'), change(2, 'invalid')],
    });
    expect(records[1].url).toContain(`/api/projects/${Q}/sync-conflicts`);
    expect(records[1].body).toStrictEqual({ changes: [change(4, 'not_editable')] });
    for (const r of records) expect(r.headers.get('x-ezdraft-membership')).toBe('m1');
    const lastObjects = Math.max(...seen.map((s, i) => (isObjects(s) ? i : -1)));
    expect(seen.indexOf(records[0])).toBeGreaterThan(lastObjects);
    expect(seen.indexOf(records[1])).toBeGreaterThan(lastObjects);
    sync.dispose();
  });

  describe('record answers and caps', () => {
    // One entry (or more) of P refused with a 403, then the record call answered by `record`.
    const run = async (
      ids: number[],
      record: (s: Seen) => Answer,
      values?: (n: number) => ReturnType<typeof v>,
    ) => {
      const storage = createMemoryStorage();
      await storage.put(
        P,
        0,
        ids.map((n) => ({ id: idOf(n), value: (values ?? v)(n) })),
        10,
      );
      const { seen, fetchImpl } = stub((s) => {
        if (isRecord(s)) return record(s);
        return refuse(403, 'permission_denied');
      });
      const sync = build(storage, fetchImpl);
      await sync.flush();
      return { storage, seen, sync };
    };

    it('EZD-299b T4e a 500 leaves the row pending and the next drain records it', async () => {
      let n = 0;
      const { storage, seen, sync } = await run([1], (s) => {
        n++;
        return n === 1 ? new Response('', { status: 500 }) : recordedIds(s);
      });
      expect((await storage.listConflicts())[0]).toMatchObject({ server: 'pending' });
      expect(seen.filter(isRecord)).toHaveLength(1);
      await sync.flush();
      expect(seen.filter(isRecord)).toHaveLength(2);
      expect((await storage.listConflicts())[0]).toMatchObject({
        server: 'recorded',
        serverId: 'S1',
      });
      sync.dispose();
    });

    it('EZD-299b T4e a 400 keeps the row on the device and reports it', async () => {
      const { storage, sync } = await run([1], () => refuse(400, 'invalid_input'));
      expect((await storage.listConflicts())[0]).toMatchObject({ server: 'device' });
      await vi.waitFor(() => expect(captureBrowserError).toHaveBeenCalled());
      const hit = vi
        .mocked(captureBrowserError)
        .mock.calls.find(([, where]) => where === 'outbox.record');
      expect(hit).toBeDefined();
      expect((hit?.[0] as Error).message).toBe('sync_conflict_record_refused');
      sync.dispose();
    });

    it('EZD-299b T4e a 404 makes the row not_open on the device and makes no other call', async () => {
      const { storage, seen, sync } = await run([1], () => refuse(404, 'project_not_found'));
      expect((await storage.listConflicts())[0]).toMatchObject({
        server: 'device',
        reason: 'not_open',
      });
      expect(seen).toHaveLength(2);
      sync.dispose();
    });

    it('EZD-299b T4e 1,001 rows go in two record calls of 1,000 and 1', async () => {
      const { seen, sync } = await run(
        Array.from({ length: 1001 }, (_, i) => i + 1),
        recordedIds,
      );
      expect(seen.filter(isRecord).map((s) => s.body.changes.length)).toEqual([1000, 1]);
      sync.dispose();
    });

    it('EZD-299b T4e a row of 65,537 bytes is not sent and one of 65,536 bytes is', async () => {
      const pad = (n: number) => ({
        type: 'floor',
        schemaVersion: 1,
        data: { pad: 'a'.repeat(n === 1 ? 65527 : 65526) },
      });
      const { storage, seen, sync } = await run([1, 2], recordedIds, pad as never);
      const records = seen.filter(isRecord);
      expect(records).toHaveLength(1);
      expect(records[0].body.changes.map((c) => c.id)).toEqual([idOf(2)]);
      const rows = new Map((await storage.listConflicts()).map((r) => [r.objectId, r]));
      expect(rows.get(idOf(1))?.server).toBe('device');
      expect(rows.get(idOf(2))?.server).toBe('recorded');
      sync.dispose();
    });
  });

  it('EZD-299b T4f a record call racing Remove deletes the server copy it just made', async () => {
    const storage = createMemoryStorage();
    await put(storage, P, [1]);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { seen, fetchImpl } = stub(async (s) => {
      if (isRecord(s)) {
        await held;
        return Response.json({ ids: ['S1'] }, { status: 201 });
      }
      if (isDelete(s)) return Response.json({}, { status: 200 });
      return refuse(403, 'permission_denied');
    });
    const sync = build(storage, fetchImpl);
    const done = sync.flush();
    await vi.waitFor(() => expect(seen.some(isRecord)).toBe(true));
    await storage.deleteConflicts([{ projectId: P, objectId: idOf(1) }]);
    release();
    await done;

    const deletes = seen.filter(isDelete);
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toContain('/api/sync-conflicts/S1');
    expect(await storage.listConflicts()).toEqual([]);
    sync.dispose();
  });

  it('EZD-299b T4g Keep mine waits offline, then sends with resolves, and a plain save has none', async () => {
    const storage = createMemoryStorage();
    await put(storage, P, [4]);
    const [entry] = await storage.list();
    await storage.moveToConflicts([{ entry, reason: 'conflict', serverSeq: 7 }], 0);
    await storage.setConflictServer([
      { projectId: P, objectId: idOf(4), refusedAt: 0, server: 'recorded', serverId: 'S2' },
    ]);
    const row: DeviceConflict = (await storage.listConflicts())[0];
    expect(row.serverId).toBe('S2');

    const online = createOnline(false);
    const { seen, fetchImpl } = stub((s) =>
      savedResponse({ url: s.url, method: s.method, body: s.body as never }),
    );
    const sync = createOutboxSync({
      actor,
      storage,
      fetchImpl,
      lock: alwaysLock,
      online: online.source,
    });
    await sync.keepMine(row, 7);
    expect(seen).toHaveLength(0);
    expect((await storage.list())[0]).toMatchObject({ id: idOf(4), baseSeq: 7 });
    expect((await storage.listConflicts())[0]).toMatchObject({ state: 'requeued' });
    expect(sync.getState().status).toBe('offline');

    online.set(true);
    await vi.advanceTimersByTimeAsync(0);
    await sync.flush();
    const posts = seen.filter(isObjects);
    expect(posts).toHaveLength(1);
    expect(posts[0].body.changes[0]).toMatchObject({ id: idOf(4), baseSeq: 7 });
    expect(posts[0].body.resolves).toEqual(['S2']);
    expect(await storage.listConflicts()).toEqual([]);
    expect(await storage.list()).toEqual([]);

    void sync.enqueue(P, 0, [{ id: idOf(5), value: v(5) }]);
    await vi.advanceTimersByTimeAsync(2000);
    const later = seen.filter(isObjects);
    expect(later).toHaveLength(2);
    expect(later[1].body).not.toHaveProperty('resolves');
    sync.dispose();
  });

  it('EZD-299b T4h Keep mine on a row a newer refusal replaced changes nothing', async () => {
    const storage = createMemoryStorage();
    await put(storage, P, [4]);
    const [entry] = await storage.list();
    await storage.moveToConflicts([{ entry, reason: 'conflict', serverSeq: 7 }], 30);
    const stored = (await storage.listConflicts())[0];
    const old: DeviceConflict = { ...stored, refusedAt: 10 };

    const { seen, fetchImpl } = stub((s) =>
      savedResponse({ url: s.url, method: s.method, body: s.body as never }),
    );
    const sync = build(storage, fetchImpl);
    const revBefore = sync.getState().conflictRev;
    expect(await sync.keepMine(old, 7)).toEqual({ kept: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(seen.filter(isObjects)).toHaveLength(0);
    expect(sync.getState().conflictRev).toBe(revBefore);
    expect(sync.getState().status).not.toBe('error');
    expect(await storage.listConflicts()).toEqual([stored]);
    sync.dispose();
  });
});
