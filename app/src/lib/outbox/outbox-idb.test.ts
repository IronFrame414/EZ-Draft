// EZD-120b U4 (vault/plans/EZD-120b.md section 4; AC-EZD-120b-4). Real IndexedDB code on fake-indexeddb, a
// new IDBFactory per test. Expected values: Q-0503 (a device database keyed by user and company), Decided
// "put" (new entry: baseSeq from the mirror or 0, rev 1, queuedAt now; existing: new value, rev + 1, rest
// kept) and "commit, drop".
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { DEVICE_DB } from './device-db';
import { createIdbOutboxStorage } from './outbox-idb';
import type { Actor } from './outbox';

const actor = (appUserId: string, tenantId: string): Actor => ({
  appUserId,
  tenantId,
  membershipId: `m-${appUserId}-${tenantId}`,
});
const U1T1 = actor('u1', 't1');
const U2T1 = actor('u2', 't1');
const U1T2 = actor('u1', 't2');
const loaded = (id: string, updatedSeq: number) => ({ id, updatedSeq, ...v(1) });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('EZD-120b device outbox storage', () => {
  it('U4 keeps each user and company apart, also after reopening', async () => {
    const people: { who: Actor; n: number }[] = [
      { who: U1T1, n: 1 },
      { who: U2T1, n: 2 },
      { who: U1T2, n: 3 },
    ];
    for (const { who, n } of people) {
      const s = createIdbOutboxStorage(who);
      await s.put('p', 0, [{ id: 'A', value: v(n) }], 100 + n);
      s.close();
    }
    for (const { who, n } of people) {
      const s = createIdbOutboxStorage(who);
      const list = await s.list();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ projectId: 'p', id: 'A', value: v(n), rev: 1, baseSeq: 0 });
      s.close();
    }
    const live = createIdbOutboxStorage(U1T1);
    const other = createIdbOutboxStorage(U2T1);
    await live.put('p', 0, [{ id: 'B', value: v(9) }], 500);
    expect((await live.list()).map((e) => e.id).sort()).toEqual(['A', 'B']);
    expect((await other.list()).map((e) => e.id)).toEqual(['A']);
    live.close();
    other.close();
  });

  it('U4 put twice bumps rev and keeps baseSeq, and a new entry takes baseSeq from the mirror', async () => {
    const s = createIdbOutboxStorage(U1T1);
    await s.replaceMirror('p', [loaded('A', 5)]);
    await s.put('p', 0, [{ id: 'A', value: v(1) }], 100);
    await s.put('p', 0, [{ id: 'A', value: v(2) }], 200);
    const list = await s.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'A', value: v(2), rev: 2, baseSeq: 5, queuedAt: 100 });
    await s.put('p', 0, [{ id: 'Z', value: v(3) }], 300);
    expect((await s.list()).find((e) => e.id === 'Z')?.baseSeq).toBe(0);
    s.close();
  });

  it('U4 commit deletes an unchanged entry, re-bases a changed one, and drop keeps a changed one', async () => {
    const s = createIdbOutboxStorage(U1T1);
    await s.put('p', 0, [{ id: 'A', value: v(1) }], 100);
    const sent = await s.list();
    await s.put('p', 0, [{ id: 'A', value: v(2) }], 200);
    await s.commit('p', sent, [{ id: 'A', updatedSeq: 7 }]);
    const kept = await s.list();
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: 'A', value: v(2), rev: 2, baseSeq: 7 });

    await s.commit('p', kept, [{ id: 'A', updatedSeq: 8 }]);
    expect(await s.list()).toEqual([]);
    await s.put('p', 0, [{ id: 'A', value: v(3) }], 300);
    expect((await s.list())[0].baseSeq).toBe(8);

    await s.put('p', 0, [{ id: 'N', value: null }], 400);
    const nullEntry = (await s.list()).find((e) => e.id === 'N');
    expect(nullEntry?.baseSeq).toBe(0);
    await s.put('p', 0, [{ id: 'N', value: v(4) }], 500);
    await s.drop(nullEntry ? [nullEntry] : []);
    expect((await s.list()).some((e) => e.id === 'N')).toBe(true);
    const current = (await s.list()).find((e) => e.id === 'N');
    await s.drop(current ? [current] : []);
    expect((await s.list()).some((e) => e.id === 'N')).toBe(false);
    s.close();
  });

  it('U4 a saved delete removes the mirror so a later put starts from baseSeq 0', async () => {
    const s = createIdbOutboxStorage(U1T1);
    await s.replaceMirror('p', [loaded('A', 5)]);
    await s.put('p', 0, [{ id: 'A', value: null }], 100);
    const sent = await s.list();
    expect(sent[0].baseSeq).toBe(5);
    await s.commit('p', sent, [{ id: 'A', updatedSeq: 6 }]);
    expect(await s.list()).toEqual([]);
    await s.put('p', 0, [{ id: 'A', value: v(1) }], 200);
    expect((await s.list())[0].baseSeq).toBe(0);
    s.close();
  });
});

// EZD-294 I1 (vault/plans/EZD-294.md section 4 and step 9; AC-EZD-294-2).
describe('EZD-294 device mirror numbers', () => {
  it('EZD-294 I1 commit writes the server number into the mirror', async () => {
    const wall = {
      type: 'wall',
      schemaVersion: 3,
      data: { attributes: { number: 5 } },
    };
    const room = { type: 'room', schemaVersion: 3, data: { attributes: { name: 'Room 1' } } };
    const s = createIdbOutboxStorage(U1T1);
    await s.put(
      'p',
      0,
      [
        { id: 'W', value: wall },
        { id: 'R', value: room },
      ],
      100,
    );
    const sent = await s.list();
    await s.commit('p', sent, [
      { id: 'W', updatedSeq: 1, number: 6 },
      { id: 'R', updatedSeq: 1 },
    ]);
    expect(await s.list()).toEqual([]);
    const db = await openDB(DEVICE_DB);
    const mirrorW = (await db.get('working_copy', ['u1', 't1', 'p', 'W'])) as {
      value: { data: { attributes: Record<string, unknown> } };
    };
    const mirrorR = (await db.get('working_copy', ['u1', 't1', 'p', 'R'])) as { value: unknown };
    db.close();
    expect(mirrorW.value.data.attributes.number).toBe(6);
    expect(mirrorR.value).toEqual(room);
    s.close();
  });
});
