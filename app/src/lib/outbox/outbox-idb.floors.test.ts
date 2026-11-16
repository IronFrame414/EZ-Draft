// EZD-6001 U14, U15 (vault/plans/EZD-6001.md section 4; Decided D-Stamp; model_object_level_check (b): a floor is not
// deleted while a live object names it). Real IndexedDB code on fake-indexeddb, a new IDBFactory per test.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { createIdbOutboxStorage } from './outbox-idb';
import type { Actor } from './outbox';

const U1T1: Actor = { appUserId: 'u1', tenantId: 't1', membershipId: 'm-u1-t1' };
const wall = { type: 'wall', schemaVersion: 1, data: {} };
const loaded = (id: string, updatedSeq: number, value: typeof wall) => ({
  id,
  updatedSeq,
  ...value,
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('EZD-6001 floor delete stamp', () => {
  it('EZD-6001 U14 a floor delete is queued just after the deletes of its objects', async () => {
    const s = createIdbOutboxStorage(U1T1);
    await s.replaceMirror('p', [
      { id: 'F', updatedSeq: 1, ...v(1) },
      loaded('w1', 2, wall),
      loaded('w2', 3, wall),
      loaded('w3', 4, wall),
    ]);
    await s.put(
      'p',
      0,
      [
        { id: 'F', value: null },
        { id: 'w1', value: null },
        { id: 'w2', value: null },
        { id: 'w3', value: null },
      ],
      1000,
    );
    const at = new Map((await s.list()).map((e) => [e.id, e.queuedAt]));
    expect(at.get('F')).toBe(1001);
    expect(at.get('w1')).toBe(1000);
    expect(at.get('w2')).toBe(1000);
    expect(at.get('w3')).toBe(1000);
    s.close();

    // A renamed floor already queued at 10, then deleted with its wall.
    globalThis.indexedDB = new IDBFactory();
    const r = createIdbOutboxStorage(U1T1);
    await r.replaceMirror('p', [{ id: 'F', updatedSeq: 1, ...v(1) }, loaded('w1', 2, wall)]);
    await r.put('p', 0, [{ id: 'F', value: v(2) }], 10);
    await r.put(
      'p',
      0,
      [
        { id: 'F', value: null },
        { id: 'w1', value: null },
      ],
      1000,
    );
    const again = new Map((await r.list()).map((e) => [e.id, e.queuedAt]));
    expect(again.get('F')).toBe(1001);
    expect(again.get('w1')).toBe(1000);
    r.close();
  });

  it('EZD-6001 U15 other stamps are kept: a wall delete keeps its time, a floor upsert takes now', async () => {
    const s = createIdbOutboxStorage(U1T1);
    await s.replaceMirror('p', [loaded('w1', 2, wall)]);
    await s.put('p', 0, [{ id: 'w1', value: { ...wall, data: { x: 1 } } }], 10);
    await s.put('p', 0, [{ id: 'w1', value: null }], 1000);
    await s.put('p', 0, [{ id: 'F2', value: v(2) }], 1000);
    const at = new Map((await s.list()).map((e) => [e.id, e.queuedAt]));
    expect(at.get('w1')).toBe(10);
    expect(at.get('F2')).toBe(1000);
    s.close();
  });
});
