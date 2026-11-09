// EZD-299b T3a-T3c (vault/plans/EZD-299b.md section 4; AC-EZD-299-16, -9). Real IndexedDB code on fake-indexeddb,
// a new IDBFactory per test as device-db.test.ts. Expected values: Decided D-Key (conflict rows live in the
// outbox store outside the actor's range, database version 1), D-Move (an entry edited during the send is not
// moved), D-Requeue, D-Resolves and D-Server.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { actorRange, countQueued, DEVICE_DB, DEVICE_DB_VERSION, OUTBOX_STORE } from './device-db';
import type { Actor } from './outbox';
import { createIdbOutboxStorage } from './outbox-idb';

const U = 'u1';
const T = 't1';
const actor = (appUserId: string, tenantId: string): Actor => ({
  appUserId,
  tenantId,
  membershipId: `m-${appUserId}-${tenantId}`,
});
const P = '11111111-1111-4111-8111-111111111111';
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
  globalThis.indexedDB = factory;
});

// A raw read of the outbox store, with no help from the storage under test.
function rawGetAll(range: IDBKeyRange): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DEVICE_DB);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction(OUTBOX_STORE, 'readonly').objectStore(OUTBOX_STORE).getAll(range);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
    };
  });
}

function rawVersion(): Promise<number> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DEVICE_DB);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const version = open.result.version;
      open.result.close();
      resolve(version);
    };
  });
}

describe('EZD-299b device conflict storage', () => {
  it('EZD-299b T3a moves an unchanged entry to the list and leaves one edited during the send', async () => {
    const s = createIdbOutboxStorage(actor(U, T));
    await s.put(P, 0, [{ id: idOf(1), value: v(1) }], 10);
    await s.put(P, 0, [{ id: idOf(2), value: v(2) }], 10);
    const [e1, e2] = await s.list();
    expect([e1.id, e2.id]).toEqual([idOf(1), idOf(2)]);

    await s.moveToConflicts([{ entry: e1, reason: 'conflict', serverSeq: 5 }], 10);
    expect((await s.list()).map((e) => e.id)).toEqual([idOf(2)]);
    const rows = await s.listConflicts();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: P,
      objectId: idOf(1),
      reason: 'conflict',
      baseSeq: 0,
      serverSeq: 5,
      lockEpoch: 0,
      value: v(1),
      refusedAt: 10,
      state: 'listed',
      server: 'pending',
      serverId: null,
    });

    // e2 is edited after list(): the old entry no longer matches, so e2 stays in the outbox.
    await s.put(P, 0, [{ id: idOf(2), value: v(9) }], 11);
    await s.moveToConflicts([{ entry: e2, reason: 'conflict', serverSeq: 5 }], 12);
    const left = await s.list();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: idOf(2), rev: 2, value: v(9) });
    expect((await s.listConflicts()).map((r) => r.objectId)).toEqual([idOf(1)]);
    s.close();
  });

  it('EZD-299b T3a requeue puts the change back in the outbox and commit removes both', async () => {
    const s = createIdbOutboxStorage(actor(U, T));
    await s.put(P, 0, [{ id: idOf(1), value: v(1) }], 10);
    const [e1] = await s.list();
    await s.moveToConflicts([{ entry: e1, reason: 'conflict', serverSeq: 5 }], 10);
    const [row1] = await s.listConflicts();

    expect(await s.requeue(row1, 5, 20)).toEqual({ kept: false });
    expect((await s.listConflicts())[0]).toMatchObject({ objectId: idOf(1), state: 'requeued' });
    const queued = await s.list();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ id: idOf(1), baseSeq: 5, rev: 1, queuedAt: 20, value: v(1) });

    await s.commit(P, queued, [{ id: idOf(1), updatedSeq: 6 }]);
    expect(await s.listConflicts()).toEqual([]);
    expect(await s.list()).toEqual([]);
    s.close();
  });

  it('EZD-299b T3a setConflictServer applies an equal refusal, keeps a newer one pending, returns a missing key', async () => {
    const s = createIdbOutboxStorage(actor(U, T));
    await s.put(P, 0, [{ id: idOf(1), value: v(1) }], 10);
    await s.put(P, 0, [{ id: idOf(2), value: v(2) }], 10);
    const [e1, e2] = await s.list();
    await s.moveToConflicts(
      [
        { entry: e1, reason: 'conflict', serverSeq: 5 },
        { entry: e2, reason: 'conflict', serverSeq: 5 },
      ],
      10,
    );

    const orphans = await s.setConflictServer([
      { projectId: P, objectId: idOf(1), refusedAt: 10, server: 'recorded', serverId: 'S1' },
      { projectId: P, objectId: idOf(2), refusedAt: 99, server: 'recorded', serverId: 'S2' },
      { projectId: P, objectId: idOf(3), refusedAt: 10, server: 'recorded', serverId: 'S3' },
    ]);
    expect(orphans).toEqual([{ projectId: P, objectId: idOf(3), serverId: 'S3' }]);
    const byId = new Map((await s.listConflicts()).map((r) => [r.objectId, r]));
    expect(byId.get(idOf(1))).toMatchObject({ server: 'recorded', serverId: 'S1' });
    expect(byId.get(idOf(2))).toMatchObject({ server: 'pending', serverId: 'S2' });
    s.close();
  });

  it('EZD-299b T3b keeps conflict rows outside the actor range, the version at 1 and the mirror base', async () => {
    const s = createIdbOutboxStorage(actor(U, T));
    await s.put(P, 0, [{ id: idOf(1), value: v(1) }], 10);
    await s.put(P, 0, [{ id: idOf(2), value: v(2) }], 10);
    const [e1] = await s.list();
    await s.moveToConflicts([{ entry: e1, reason: 'conflict', serverSeq: 5 }], 10);

    const raw = await rawGetAll(actorRange(U, T));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ id: idOf(2) });
    expect(raw[0]).not.toHaveProperty('reason');
    expect(await countQueued(U, T, factory)).toBe(1);
    expect(DEVICE_DB_VERSION).toBe(1);
    expect(await rawVersion()).toBe(1);

    // setMirror: a value sets the base of the next put; null deletes the mirror record.
    await s.setMirror(P, idOf(7), v(1), 7);
    await s.put(P, 0, [{ id: idOf(7), value: v(7) }], 11);
    await s.setMirror(P, idOf(8), null, 3);
    await s.put(P, 0, [{ id: idOf(8), value: v(8) }], 11);
    const list = await s.list();
    expect(list.find((e) => e.id === idOf(7))?.baseSeq).toBe(7);
    expect(list.find((e) => e.id === idOf(8))?.baseSeq).toBe(0);

    // A second refusal of the same object keeps the server id and takes the new reason and time.
    await s.put(P, 0, [{ id: idOf(3), value: v(3) }], 12);
    const e3 = (await s.list()).find((e) => e.id === idOf(3));
    if (e3 === undefined) throw new Error('e3 missing');
    await s.moveToConflicts([{ entry: e3, reason: 'conflict', serverSeq: 5 }], 10);
    await s.setConflictServer([
      { projectId: P, objectId: idOf(3), refusedAt: 10, server: 'recorded', serverId: 'S' },
    ]);
    await s.put(P, 0, [{ id: idOf(3), value: v(3) }], 13);
    const again = (await s.list()).find((e) => e.id === idOf(3));
    if (again === undefined) throw new Error('e3 missing');
    expect(again.rev).toBe(1);
    await s.moveToConflicts([{ entry: again, reason: 'not_open', serverSeq: null }], 30);
    const row3 = (await s.listConflicts()).find((r) => r.objectId === idOf(3));
    expect(row3).toMatchObject({
      reason: 'not_open',
      refusedAt: 30,
      server: 'device',
      serverId: 'S',
    });
    s.close();
  });

  it('EZD-299b T3c a reload keeps the list and the outbox, and another user sees neither', async () => {
    const s = createIdbOutboxStorage(actor(U, T));
    for (const n of [1, 2, 3]) await s.put(P, 0, [{ id: idOf(n), value: v(n) }], 10 + n);
    const entries = await s.list();
    await s.moveToConflicts(
      [
        { entry: entries[0], reason: 'conflict', serverSeq: 5 },
        { entry: entries[1], reason: 'invalid', serverSeq: null },
      ],
      40,
    );
    const listBefore = await s.list();
    const rowsBefore = await s.listConflicts();
    expect(listBefore).toHaveLength(1);
    expect(rowsBefore).toHaveLength(2);
    s.close();

    const again = createIdbOutboxStorage(actor(U, T));
    expect(await again.list()).toEqual(listBefore);
    expect(await again.listConflicts()).toEqual(rowsBefore);
    again.close();

    const other = createIdbOutboxStorage(actor('u2', T));
    expect(await other.list()).toEqual([]);
    expect(await other.listConflicts()).toEqual([]);
    other.close();

    // Same person, another company (D-Key: the key carries the tenant; Q-0503).
    const otherCompany = createIdbOutboxStorage(actor(U, 't2'));
    expect(await otherCompany.list()).toEqual([]);
    expect(await otherCompany.listConflicts()).toEqual([]);
    otherCompany.close();
  });

  it('EZD-299b T3d a guarded delete removes only the row of that refusal', async () => {
    const s = createIdbOutboxStorage(actor(U, T));
    await s.put(P, 0, [{ id: idOf(1), value: v(1) }], 10);
    await s.put(P, 0, [{ id: idOf(2), value: v(2) }], 10);
    const [e1, e2] = await s.list();
    await s.moveToConflicts([{ entry: e1, reason: 'conflict', serverSeq: 5 }], 10);
    const key1 = { projectId: P, objectId: idOf(1) };

    expect(await s.deleteConflicts([{ ...key1, refusedAt: 9 }])).toEqual([key1]);
    expect((await s.listConflicts()).map((r) => r.objectId)).toEqual([idOf(1)]);
    expect(await s.deleteConflicts([{ ...key1, refusedAt: null }])).toEqual([key1]);
    expect((await s.listConflicts()).map((r) => r.objectId)).toEqual([idOf(1)]);
    expect(await s.deleteConflicts([{ ...key1, refusedAt: 10 }])).toEqual([]);
    expect(await s.listConflicts()).toEqual([]);

    expect(await s.deleteConflicts([{ ...key1, refusedAt: 10 }])).toEqual([]);

    await s.moveToConflicts([{ entry: e2, reason: 'conflict', serverSeq: 5 }], 10);
    expect(await s.deleteConflicts([{ projectId: P, objectId: idOf(2) }])).toEqual([]);
    expect(await s.listConflicts()).toEqual([]);
    s.close();
  });

  it('EZD-299b T3e a requeue of an older refusal is kept out by a newer one', async () => {
    const s = createIdbOutboxStorage(actor(U, T));
    await s.put(P, 0, [{ id: idOf(1), value: v(1) }], 10);
    const [e1] = await s.list();
    await s.moveToConflicts([{ entry: e1, reason: 'conflict', serverSeq: 5 }], 10);
    const [rowAt10] = await s.listConflicts();

    await s.put(P, 0, [{ id: idOf(1), value: v(2) }], 20);
    const [again] = await s.list();
    await s.moveToConflicts([{ entry: again, reason: 'conflict', serverSeq: 6 }], 30);
    const [rowAt30] = await s.listConflicts();
    expect(rowAt30.refusedAt).toBe(30);

    expect(await s.requeue(rowAt10, 5, 40)).toEqual({ kept: true });
    expect(await s.listConflicts()).toEqual([rowAt30]);
    expect((await s.listConflicts())[0].state).toBe('listed');
    expect(await s.list()).toEqual([]);

    expect(await s.requeue(rowAt30, 5, 40)).toEqual({ kept: false });
    expect((await s.listConflicts())[0]).toMatchObject({ refusedAt: 30, state: 'requeued' });
    expect((await s.list())[0]).toMatchObject({ id: idOf(1), baseSeq: 5 });
    s.close();
  });
});
