// EZD-299b T6-T8 (vault/plans/EZD-299b.md section 4; AC-EZD-299-16, -2, -3, -4). The conflict list's merge, its
// three actions and its stale-refresh rule, on the in-memory storage and fetch stubs; nothing leaves the process.
// Expected values: Decided D-Merge, D-KeepTheirs, D-Remove, D-KeepMine (list), D-Stale, D-Api and Q-0632 (a), as
// the plan's section 4 rows word them. Fixture builders item(), row(), X and s6 are the plan's.
import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createMemoryStorage, v } from '../../../test-harness/outbox/sync-support';
import type { DeviceConflict } from '../outbox/outbox';
import type { OutboxSync, SyncState } from '../outbox/outbox-sync';
import type { SyncConflictItem } from './conflicts';
import { createConflictList, mergeConflicts, type ConflictListState } from './conflict-list';

const P = '11111111-1111-4111-8111-111111111111';
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const keyOf = (n: number) => `${P}/${idOf(n)}`;

const item = (o: Partial<SyncConflictItem> = {}): SyncConflictItem => ({
  id: 'S5',
  projectId: P,
  projectName: 'Kitchen',
  objectId: idOf(5),
  reason: 'conflict',
  baseSeq: 1,
  mine: { deleted: false, ...v(5) },
  saved: { updatedSeq: 4, deleted: false, ...v(50) },
  savedBy: 'Dana Ruiz',
  savedAt: '2026-11-06T00:00:00.000Z',
  clientName: 'Client A',
  createdAt: '2026-11-07T00:00:00.000Z',
  updatedAt: '2026-11-07T00:00:00.000Z',
  ...o,
});

const row = (n: number, o: Partial<DeviceConflict> = {}): DeviceConflict => ({
  projectId: P,
  objectId: idOf(n),
  reason: 'conflict',
  baseSeq: 1,
  serverSeq: 4,
  lockEpoch: 0,
  value: v(n),
  refusedAt: 0,
  state: 'listed',
  server: 'pending',
  serverId: null,
  ...o,
});

const X = item({ id: 'SX', objectId: idOf(88) });
const s6 = item({
  id: 'S6',
  objectId: idOf(6),
  reason: 'not_open',
  projectName: null,
  mine: null,
  saved: null,
  savedBy: null,
  savedAt: null,
  clientName: null,
});

describe('EZD-299b conflict list merge', () => {
  it('EZD-299b T6 merges the device rows with the server list', () => {
    const d1 = row(1);
    const d2 = row(2, { server: 'recorded', serverId: 'S2' });
    const d3 = row(3, { state: 'requeued' });
    const d4 = row(4, { state: 'requeued' });
    const d5 = row(5, { serverSeq: 3 });
    const s5 = item();
    const queued = new Set([keyOf(3)]);

    const out = mergeConflicts([d1, d2, d3, d4, d5], queued, [s5, s6]);
    expect(out.rows.map((r) => r.key)).toEqual([keyOf(5), keyOf(6), keyOf(1), keyOf(4)]);
    expect(out.resolvedElsewhere).toEqual([{ projectId: P, objectId: idOf(2) }]);

    const byKey = new Map(out.rows.map((r) => [r.key, r]));
    const r1 = byKey.get(keyOf(1));
    expect(r1).toMatchObject({
      projectId: P,
      objectId: idOf(1),
      reason: 'conflict',
      projectName: null,
      saved: null,
      savedBy: null,
      savedAt: null,
      clientName: null,
      mine: { deleted: false, ...v(1) },
      serverSeq: 4,
      refusedAt: 0,
      at: 0,
      actions: ['keep_mine', 'keep_theirs'],
    });
    expect(byKey.get(keyOf(4))).toMatchObject({
      objectId: idOf(4),
      reason: 'conflict',
      saved: null,
      savedBy: null,
      refusedAt: 0,
      actions: ['keep_mine', 'keep_theirs'],
    });
    expect(byKey.get(keyOf(5))).toMatchObject({
      serverId: 'S5',
      serverSeq: 3,
      projectName: 'Kitchen',
      reason: 'conflict',
      baseSeq: 1,
      mine: { deleted: false, ...v(5) },
      saved: { updatedSeq: 4, deleted: false, ...v(50) },
      savedBy: 'Dana Ruiz',
      savedAt: '2026-11-06T00:00:00.000Z',
      clientName: 'Client A',
      refusedAt: 0,
      at: Date.parse('2026-11-07T00:00:00.000Z'),
      actions: ['keep_mine', 'keep_theirs'],
    });
    expect(byKey.get(keyOf(6))).toMatchObject({
      serverId: 'S6',
      reason: 'not_open',
      mine: null,
      saved: null,
      savedBy: null,
      savedAt: null,
      clientName: null,
      serverSeq: null,
      refusedAt: null,
      actions: ['remove'],
    });
    expect(out.rows.some((r) => r.key === keyOf(3))).toBe(false);
    expect(out.rows.some((r) => r.key === keyOf(2))).toBe(false);

    const offline = mergeConflicts([d1, d2, d3, d4, d5], queued, null);
    expect(offline.rows.map((r) => r.key)).toEqual([keyOf(1), keyOf(2), keyOf(4), keyOf(5)]);
    expect(offline.resolvedElsewhere).toEqual([]);
  });
});

// A fake sync: a store with conflictRev, and keepMine as a spy.
function fakeSync(kept = false) {
  const store = createStore<SyncState>()(() => ({
    status: 'idle',
    failures: 0,
    problem: null,
    lastSavedAt: null,
    conflictRev: 0,
  }));
  const sync: OutboxSync = {
    ...store,
    keepMine: vi.fn(async () => ({ kept })),
    enqueue: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
    retry: vi.fn(),
    dispose: vi.fn(),
  };
  return { sync, store };
}

const modelWith = (objects: unknown[]) => ({
  project: { id: P, name: 'Kitchen', clientName: null, planScale: 0.5 },
  viewer: { appUserId: 'u1', tenantId: 't1', membershipId: 'm1', canEdit: true },
  lockEpoch: 0,
  objects,
  invalid: [],
});

type Call = { method: string; url: string };
function setup(opts: {
  items?: SyncConflictItem[] | null;
  deleteThrows?: boolean;
  model?: unknown;
  rows?: DeviceConflict[];
  withSync?: boolean;
  holdDelete?: Promise<void>;
  keepMineKept?: boolean;
}) {
  const storage = createMemoryStorage();
  for (const r of opts.rows ?? []) storage.conflicts.set(`${r.projectId}|${r.objectId}`, r);
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    if (method === 'DELETE') {
      if (opts.holdDelete) await opts.holdDelete;
      if (opts.deleteThrows) throw new TypeError('network');
      return Response.json({}, { status: 200 });
    }
    if (url.endsWith('/model')) return Response.json(opts.model ?? modelWith([]), { status: 200 });
    if (opts.items === null) return new Response('', { status: 500 });
    return Response.json({ items: opts.items ?? [] }, { status: 200 });
  }) as unknown as typeof fetch;
  const { sync, store } = fakeSync(opts.keepMineKept ?? false);
  const applyRemote = vi.fn();
  const setMirror = vi.spyOn(storage, 'setMirror');
  const deleteConflicts = vi.spyOn(storage, 'deleteConflicts');
  const list = createConflictList({
    storage,
    sync: opts.withSync === false ? null : sync,
    fetchImpl,
    editor: { projectId: P, lockEpoch: 0, applyRemote },
  });
  return { storage, calls, list, sync, syncStore: store, applyRemote, setMirror, deleteConflicts };
}

describe('EZD-299b conflict list actions', () => {
  it('EZD-299b T7a Keep theirs takes the saved value, removes the server copy and updates the editor', async () => {
    const t = setup({
      items: [item({ id: 'S' })],
      rows: [row(5, { server: 'recorded', serverId: 'S' })],
    });
    await t.list.refresh();
    expect(t.list.getState().rows.map((r) => r.key)).toEqual([keyOf(5)]);

    const result = await t.list.keepTheirs(keyOf(5));
    expect(result).toEqual({ ok: true });
    expect(t.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    expect(t.calls.find((c) => c.method === 'DELETE')?.url).toContain('/api/sync-conflicts/S');
    expect(t.list.getState().rows).toEqual([]);
    expect(await t.storage.listConflicts()).toEqual([]);
    expect(t.setMirror).toHaveBeenCalledWith(P, idOf(5), v(50), 4);
    expect(t.applyRemote).toHaveBeenCalledTimes(1);
    expect(t.applyRemote).toHaveBeenCalledWith([{ id: idOf(5), value: v(50) }]);
    t.list.dispose();
  });

  it('EZD-299b T7a Keep theirs without a saved value reads the server model', async () => {
    const t = setup({
      items: [],
      rows: [row(5)],
      model: modelWith([{ id: idOf(5), ...v(60), updatedSeq: 6 }]),
    });
    await t.list.refresh();
    expect(await t.list.keepTheirs(keyOf(5))).toEqual({ ok: true });
    expect(
      t.calls.some((c) => c.method === 'GET' && c.url.includes(`/api/projects/${P}/model`)),
    ).toBe(true);
    expect(t.setMirror).toHaveBeenCalledWith(P, idOf(5), v(60), 6);
    expect(t.applyRemote).toHaveBeenCalledWith([{ id: idOf(5), value: v(60) }]);
    t.list.dispose();
  });

  it('EZD-299b T7a a failed server delete keeps the row and changes nothing', async () => {
    const t = setup({
      items: [item({ id: 'S' })],
      rows: [row(5, { server: 'recorded', serverId: 'S' })],
      deleteThrows: true,
    });
    await t.list.refresh();
    expect(await t.list.keepTheirs(keyOf(5))).toEqual({ ok: false, reason: 'failed' });
    expect(t.list.getState().rows.map((r) => r.key)).toEqual([keyOf(5)]);
    expect(await t.storage.listConflicts()).toHaveLength(1);
    expect(t.applyRemote).toHaveBeenCalledTimes(0);
    t.list.dispose();
  });

  it('EZD-299b T7a Remove deletes the server copy and the row and leaves the editor alone', async () => {
    const t = setup({ items: [s6] });
    await t.list.refresh();
    expect(t.list.getState().rows.map((r) => r.key)).toEqual([keyOf(6)]);
    expect(await t.list.remove(keyOf(6))).toEqual({ ok: true });
    expect(t.calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([
      expect.stringContaining('/api/sync-conflicts/S6'),
    ]);
    expect(t.list.getState().rows).toEqual([]);
    expect(t.applyRemote).toHaveBeenCalledTimes(0);
    t.list.dispose();
  });

  it('EZD-299b T7a an unknown key is not_found', async () => {
    const t = setup({ items: [] });
    await t.list.refresh();
    expect(await t.list.keepTheirs('nope')).toEqual({ ok: false, reason: 'not_found' });
    expect(await t.list.keepMine('nope')).toEqual({ ok: false, reason: 'not_found' });
    expect(await t.list.remove('nope')).toEqual({ ok: false, reason: 'not_found' });
    t.list.dispose();
  });

  it('EZD-299b T7b Keep mine sends their delete as my value and my delete as a delete', async () => {
    const theirDelete = setup({
      items: [item({ id: 'S', saved: { updatedSeq: 4, deleted: true } })],
      rows: [row(5, { server: 'recorded', serverId: 'S' })],
    });
    await theirDelete.list.refresh();
    expect(await theirDelete.list.keepMine(keyOf(5))).toEqual({ ok: true });
    const keepMine = vi.mocked(theirDelete.sync.keepMine);
    expect(keepMine).toHaveBeenCalledTimes(1);
    expect(keepMine.mock.calls[0][0]).toMatchObject({
      projectId: P,
      objectId: idOf(5),
      value: v(5),
    });
    expect(keepMine.mock.calls[0][1]).toBe(4);
    expect(theirDelete.applyRemote).toHaveBeenCalledWith([{ id: idOf(5), value: v(5) }]);
    theirDelete.list.dispose();

    const myDelete = setup({
      items: [item({ id: 'S', mine: { deleted: true } })],
      rows: [row(5, { server: 'recorded', serverId: 'S', value: null })],
    });
    await myDelete.list.refresh();
    expect(await myDelete.list.keepMine(keyOf(5))).toEqual({ ok: true });
    const mineDelete = vi.mocked(myDelete.sync.keepMine);
    expect(mineDelete.mock.calls[0][0]).toMatchObject({ objectId: idOf(5), value: null });
    expect(myDelete.applyRemote).toHaveBeenCalledWith([{ id: idOf(5), value: null }]);
    myDelete.list.dispose();
  });

  it('EZD-299b T7b Keep mine is not allowed on an invalid row or without a sync', async () => {
    const invalid = setup({
      items: [item({ id: 'SI', objectId: idOf(7), reason: 'invalid' })],
    });
    await invalid.list.refresh();
    expect(await invalid.list.keepMine(keyOf(7))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(invalid.sync.keepMine).not.toHaveBeenCalled();
    invalid.list.dispose();

    const noSync = setup({ items: [item({ id: 'S' })], withSync: false });
    await noSync.list.refresh();
    expect(await noSync.list.keepMine(keyOf(5))).toEqual({ ok: false, reason: 'not_allowed' });
    noSync.list.dispose();
  });

  it('EZD-299b T7b Keep mine sends the device value, and a later queued edit to the editor', async () => {
    const device = setup({
      items: [item({ id: 'S' })],
      rows: [row(5, { value: v(55), server: 'recorded', serverId: 'S' })],
    });
    await device.list.refresh();
    expect(await device.list.keepMine(keyOf(5))).toEqual({ ok: true });
    expect(vi.mocked(device.sync.keepMine).mock.calls[0][0]).toMatchObject({ value: v(55) });
    expect(device.applyRemote).toHaveBeenCalledWith([{ id: idOf(5), value: v(55) }]);
    device.list.dispose();

    const later = setup({
      items: [item({ id: 'S' })],
      rows: [row(5, { value: v(55), server: 'recorded', serverId: 'S' })],
    });
    await later.list.refresh();
    await later.storage.put(P, 0, [{ id: idOf(5), value: v(77) }], 10);
    expect(await later.list.keepMine(keyOf(5))).toEqual({ ok: true });
    expect(later.applyRemote).toHaveBeenCalledWith([{ id: idOf(5), value: v(77) }]);
    later.list.dispose();
  });
});

type Deferred = { promise: Promise<void>; release: () => void };
const deferred = (): Deferred => {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe('EZD-299b conflict list stale refresh', () => {
  const actions = ['keep_theirs', 'remove', 'keep_mine', 'sync_bump'] as const;
  const answers = ['item_x', 'error_500'] as const;
  const cells = actions.flatMap((a) => answers.map((b) => [a, b] as const));

  it.each(cells)(
    'EZD-299b T8 during a slow read, %s then a %s answer is not applied',
    async (action, answer) => {
      const storage = createMemoryStorage();
      storage.conflicts.set(`${P}|${idOf(5)}`, row(5));
      const held = deferred();
      const held2 = deferred();
      let phase: 'setup' | 'run' = 'setup';
      let gets = 0;
      const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method === 'DELETE') return Response.json({}, { status: 200 });
        if (url.endsWith('/model')) return Response.json(modelWith([]), { status: 200 });
        if (phase === 'run') gets++;
        if (phase === 'run' && gets === 1) {
          await held.promise;
          return answer === 'item_x'
            ? Response.json({ items: [X] }, { status: 200 })
            : new Response('', { status: 500 });
        }
        if (phase === 'run' && gets === 2) await held2.promise;
        return Response.json({ items: [] }, { status: 200 });
      }) as unknown as typeof fetch;
      const { sync, store } = fakeSync();
      const deleteConflicts = vi.spyOn(storage, 'deleteConflicts');
      const list = createConflictList({
        storage,
        sync,
        fetchImpl,
        editor: { projectId: P, lockEpoch: 0, applyRemote: vi.fn() },
      });
      await list.refresh();
      expect(list.getState().rows.map((r) => r.key)).toEqual([keyOf(5)]);
      storage.conflicts.set(
        `${P}|${idOf(9)}`,
        row(9, { server: 'recorded', serverId: 'SR', state: 'listed' }),
      );
      deleteConflicts.mockClear();
      const deletedKeys = () =>
        deleteConflicts.mock.calls.flatMap((c) => c[0].map((k) => k.objectId));

      const seen: ConflictListState[] = [];
      list.subscribe((s) => seen.push(s));
      phase = 'run';
      const first = list.refresh();
      await vi.waitFor(() => expect(gets).toBe(1));

      if (action === 'keep_theirs') expect((await list.keepTheirs(keyOf(5))).ok).toBe(true);
      if (action === 'remove') expect((await list.remove(keyOf(5))).ok).toBe(true);
      if (action === 'keep_mine') expect((await list.keepMine(keyOf(5))).ok).toBe(true);
      if (action === 'sync_bump') store.setState({ conflictRev: 1 });

      held.release();
      await vi.waitFor(() => expect(gets).toBe(2));
      await new Promise<void>((resolve) => setTimeout(resolve, 30));

      // GET 1 (stale) did not list the recorded row SR; it must not count as resolved elsewhere (D-Stale).
      expect(deletedKeys()).not.toContain(idOf(9));
      expect(seen.some((s) => s.rows.some((r) => r.objectId === idOf(88)))).toBe(false);
      expect(seen.some((s) => s.server === 'failed')).toBe(false);

      held2.release();
      await first;
      await vi.waitFor(() => {
        expect(list.getState().server).toBe('ok');
        expect(deletedKeys()).toContain(idOf(9));
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 30));

      expect(gets).toBe(2);
      expect(seen.some((s) => s.rows.some((r) => r.objectId === idOf(88)))).toBe(false);
      expect(seen.some((s) => s.server === 'failed')).toBe(false);
      const expectedDeletes = action === 'keep_theirs' || action === 'remove' ? 1 : 0;
      expect(deletedKeys().filter((o) => o === idOf(5))).toHaveLength(expectedDeletes);
      expect(list.getState().server).toBe('ok');
      const finalKeys = list.getState().rows.map((r) => r.key);
      expect(finalKeys).toEqual(action === 'keep_theirs' || action === 'remove' ? [] : [keyOf(5)]);
      list.dispose();
    },
  );
});

// A newer refusal of the same object: put a new edit at idOf(n) and move it as `conflict` at 50 (D-Move keeps
// the server id of the row it replaces).
async function refuseAgainAt50(storage: ReturnType<typeof createMemoryStorage>, n = 5, value = 55) {
  await storage.put(P, 0, [{ id: idOf(n), value: v(value) }], 10);
  const entry = (await storage.list()).find((e) => e.id === idOf(n));
  if (entry === undefined) throw new Error('entry missing');
  await storage.moveToConflicts([{ entry, reason: 'conflict', serverSeq: 4 }], 50);
}

const getsOf = (calls: Call[]) =>
  calls.filter((c) => c.method === 'GET' && c.url.endsWith('/api/sync-conflicts')).length;
const deletesOf = (calls: Call[]) => calls.filter((c) => c.method === 'DELETE').length;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

describe('EZD-299b conflict list guards', () => {
  const act = (list: ReturnType<typeof setup>['list'], action: string, key: string) =>
    action === 'keepMine'
      ? list.keepMine(key)
      : action === 'keepTheirs'
        ? list.keepTheirs(key)
        : list.remove(key);

  describe.each(['keepMine', 'keepTheirs', 'remove'])('T7c %s', (action) => {
    it(`EZD-299b T7c ${action} refuses a row replaced by a newer refusal before the click`, async () => {
      const t = setup({
        items: [item({ id: 'S' })],
        rows: [row(5, { server: 'recorded', serverId: 'S' })],
      });
      await t.list.refresh();
      expect(getsOf(t.calls)).toBe(1);
      await refuseAgainAt50(t.storage);

      expect(await act(t.list, action, keyOf(5))).toEqual({ ok: false, reason: 'failed' });
      const stored = (await t.storage.listConflicts()).find((r) => r.objectId === idOf(5));
      expect(stored).toMatchObject({ refusedAt: 50, value: v(55) });
      expect(t.setMirror).not.toHaveBeenCalled();
      expect(t.applyRemote).not.toHaveBeenCalled();
      expect(t.sync.keepMine).not.toHaveBeenCalled();
      expect(deletesOf(t.calls)).toBe(0);
      await vi.waitFor(() => expect(getsOf(t.calls)).toBe(2));
      await settle();
      expect(getsOf(t.calls)).toBe(2);
      t.list.dispose();
    });

    it(`EZD-299b T7c ${action} refuses a server-only row when a device row appeared before the click`, async () => {
      const t = setup({ items: [item({ id: 'S' })] });
      await t.list.refresh();
      expect(t.list.getState().rows[0]?.refusedAt).toBeNull();
      await refuseAgainAt50(t.storage);

      expect(await act(t.list, action, keyOf(5))).toEqual({ ok: false, reason: 'failed' });
      const stored = (await t.storage.listConflicts()).find((r) => r.objectId === idOf(5));
      expect(stored).toMatchObject({ refusedAt: 50, value: v(55) });
      expect(t.setMirror).not.toHaveBeenCalled();
      expect(t.applyRemote).not.toHaveBeenCalled();
      expect(t.sync.keepMine).not.toHaveBeenCalled();
      expect(deletesOf(t.calls)).toBe(0);
      await vi.waitFor(() => expect(getsOf(t.calls)).toBe(2));
      await settle();
      expect(getsOf(t.calls)).toBe(2);
      t.list.dispose();
    });
  });

  it.each(['keepTheirs', 'remove'])(
    'EZD-299b T7c %s keeps the row when a newer refusal lands during the server delete',
    async (action) => {
      const hold = deferred();
      const t = setup({
        items: [item({ id: 'S' })],
        rows: [row(5, { server: 'recorded', serverId: 'S' })],
        holdDelete: hold.promise,
      });
      await t.list.refresh();
      const pending = act(t.list, action, keyOf(5));
      await vi.waitFor(() => expect(deletesOf(t.calls)).toBe(1));
      await refuseAgainAt50(t.storage);
      hold.release();

      expect(await pending).toEqual({ ok: false, reason: 'failed' });
      const stored = (await t.storage.listConflicts()).find((r) => r.objectId === idOf(5));
      expect(stored).toMatchObject({ refusedAt: 50, value: v(55) });
      expect(t.setMirror).not.toHaveBeenCalled();
      expect(t.applyRemote).not.toHaveBeenCalled();
      expect(t.list.getState().rows.map((r) => r.key)).toEqual([keyOf(5)]);
      await vi.waitFor(() => expect(getsOf(t.calls)).toBe(2));
      await settle();
      expect(getsOf(t.calls)).toBe(2);
      t.list.dispose();
    },
  );

  it('EZD-299b T7c keepMine changes nothing when the sync says a newer refusal kept the row', async () => {
    const t = setup({
      items: [item({ id: 'S' })],
      rows: [row(5, { server: 'recorded', serverId: 'S' })],
      keepMineKept: true,
    });
    await t.list.refresh();
    const before = await t.storage.listConflicts();

    expect(await t.list.keepMine(keyOf(5))).toEqual({ ok: false, reason: 'failed' });
    expect(t.sync.keepMine).toHaveBeenCalledTimes(1);
    expect(await t.storage.listConflicts()).toEqual(before);
    expect(t.setMirror).not.toHaveBeenCalled();
    expect(t.applyRemote).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(getsOf(t.calls)).toBe(2));
    await settle();
    expect(getsOf(t.calls)).toBe(2);
    t.list.dispose();
  });

  it.each(['keepTheirs', 'remove'])(
    'EZD-299b T7d %s uses the server id the device row gained after the list was read',
    async (action) => {
      const t = setup({
        items: [],
        rows: [row(5)],
        model: modelWith([{ id: idOf(5), ...v(60), updatedSeq: 6 }]),
      });
      await t.list.refresh();
      expect(t.list.getState().rows[0]?.serverId).toBeNull();
      await t.storage.setConflictServer([
        { projectId: P, objectId: idOf(5), refusedAt: 0, server: 'recorded', serverId: 'S9' },
      ]);

      expect(await act(t.list, action, keyOf(5))).toEqual({ ok: true });
      const deletes = t.calls.filter((c) => c.method === 'DELETE');
      expect(deletes).toHaveLength(1);
      expect(deletes[0].url).toContain('/api/sync-conflicts/S9');
      expect((await t.storage.listConflicts()).filter((r) => r.objectId === idOf(5))).toEqual([]);
      t.list.dispose();
    },
  );

  it('EZD-299b T8b a refresh does not delete a row a newer refusal replaced during the read', async () => {
    const storage = createMemoryStorage();
    storage.conflicts.set(`${P}|${idOf(2)}`, row(2, { server: 'recorded', serverId: 'S2' }));
    const held = deferred();
    let gets = 0;
    const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') !== 'GET' || url.endsWith('/model'))
        return Response.json({}, { status: 200 });
      gets++;
      if (gets === 1) await held.promise;
      return Response.json({ items: [] }, { status: 200 });
    }) as unknown as typeof fetch;
    const { sync } = fakeSync();
    const list = createConflictList({
      storage,
      sync,
      fetchImpl,
      editor: { projectId: P, lockEpoch: 0, applyRemote: vi.fn() },
    });

    const first = list.refresh();
    await vi.waitFor(() => expect(gets).toBe(1));
    await refuseAgainAt50(storage, 2, 22);
    held.release();
    await first;
    await vi.waitFor(() => expect(gets).toBe(2));
    await settle();

    const stored = (await storage.listConflicts()).find((r) => r.objectId === idOf(2));
    expect(stored).toMatchObject({ refusedAt: 50, server: 'pending' });
    expect(list.getState().rows.find((r) => r.key === keyOf(2))?.refusedAt).toBe(50);
    expect(gets).toBe(2);
    list.dispose();
  });
});
