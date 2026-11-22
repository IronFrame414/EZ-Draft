// EZD-1402 (phase-14 EZD-1402 "typed field actions ... and their photo blobs, with a count and size readout"; 03b
// Architecture rule 9 "One outbox"; Q-0503). Real IndexedDB code on fake-indexeddb, a new IDBFactory per test.
// Expected values: actions come back oldest first; one person's and one company's actions are never seen under
// another; the model outbox never reads them; the count covers model edits and field actions; the size is the
// action record's JSON bytes plus the photo's bytes.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { countQueued } from './device-db';
import { readout, type FieldAction } from './field-action';
import { createFieldQueue } from './field-queue';
import type { Actor } from './outbox';
import { createIdbOutboxStorage } from './outbox-idb';

const actor = (appUserId: string, tenantId: string): Actor => ({
  appUserId,
  tenantId,
  membershipId: `m-${appUserId}-${tenantId}`,
});
const U1T1 = actor('u1', 't1');
const P = 'p1';

let n = 0;
const ids = () => `a${++n}`;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  n = 0;
});

describe('EZD-1402 field action queue', () => {
  it('keeps each action with its kind, ops, base version and photo, oldest first', async () => {
    const q = createFieldQueue(U1T1, ids);
    const blob = new Blob([new Uint8Array(1000)], { type: 'image/jpeg' });
    await q.add({ projectId: P, kind: 'photo_pin', ops: { x: 1 }, photo: { blob, ext: 'jpg' } }, 200);
    await q.add(
      { projectId: P, kind: 'task_check', ops: { taskId: 't' }, baseVersionId: 'v1' },
      100,
    );
    const list = await q.list();
    expect(list.map((a) => [a.id, a.kind, a.queuedAt, a.state])).toEqual([
      ['a2', 'task_check', 100, 'queued'],
      ['a1', 'photo_pin', 200, 'queued'],
    ]);
    expect(list[0]!.baseVersionId).toBe('v1');
    expect(list[0]!.photo).toBeNull();
    expect(list[1]!.baseVersionId).toBeNull();
    expect(list[1]!.photo?.ext).toBe('jpg');
    expect(list[1]!.photo?.blob.size).toBe(1000);
    q.close();
  });

  it('keeps one person and one company apart, and the model outbox does not see field actions', async () => {
    const mine = createFieldQueue(U1T1, ids);
    await mine.add({ projectId: P, kind: 'task_check', ops: {} }, 1);
    expect(await createFieldQueue(actor('u2', 't1')).list()).toEqual([]);
    expect(await createFieldQueue(actor('u1', 't2')).list()).toEqual([]);
    const model = createIdbOutboxStorage(U1T1);
    expect(await model.list()).toEqual([]);
    expect(await model.listConflicts()).toEqual([]);
    model.close();
    mine.close();
  });

  it('remove deletes the action; refuse keeps it, marked with the code', async () => {
    const q = createFieldQueue(U1T1, ids);
    const a = await q.add({ projectId: P, kind: 'task_check', ops: {} }, 1);
    const b = await q.add({ projectId: P, kind: 'measurement', ops: {} }, 2);
    await q.refuse(a, 'permission_denied');
    await q.remove(b);
    const list = await q.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a1', state: 'refused', refusal: 'permission_denied' });
    q.close();
  });

  it('countQueued counts model edits and field actions together', async () => {
    const model = createIdbOutboxStorage(U1T1);
    await model.put(P, 0, [{ id: 'o1', value: v(1) }, { id: 'o2', value: v(2) }], 1);
    const q = createFieldQueue(U1T1, ids);
    await q.add({ projectId: P, kind: 'task_check', ops: {} }, 1);
    expect(await countQueued('u1', 't1')).toBe(3);
    expect(await countQueued('u2', 't1')).toBe(0);
    model.close();
    q.close();
  });

  it('the readout counts both and sizes them: JSON bytes of each record plus photo bytes', async () => {
    const model = createIdbOutboxStorage(U1T1);
    await model.put(P, 0, [{ id: 'o1', value: v(1) }], 5);
    const q = createFieldQueue(U1T1, ids);
    const blob = new Blob([new Uint8Array(2500)], { type: 'image/png' });
    await q.add({ projectId: P, kind: 'photo_pin', ops: {}, photo: { blob, ext: 'png' } }, 7);
    const entry = (await model.list())[0]!;
    const json = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;
    const actionRecord = {
      id: 'a1',
      projectId: P,
      kind: 'photo_pin',
      ops: {},
      baseVersionId: null,
      queuedAt: 7,
    };
    expect(await q.readout()).toEqual({
      count: 2,
      bytes: json(entry) + json(actionRecord) + 2500,
    });
    model.close();
    q.close();
  });

  it('readout of no actions is 0 and 0', () => {
    expect(readout([] as FieldAction[])).toEqual({ count: 0, bytes: 0 });
  });
});
