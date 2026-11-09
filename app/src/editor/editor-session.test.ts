// EZD-120c U5-U7 (vault/plans/EZD-120c.md section 4; AC-EZD-120c-10, -11, -13, -14, -15). Expected values: plan
// Decided "Open" (403 no-access, 404 not-found, else failed; a body that is not JSON reads as status 0 in
// fetchModel), "Ready" (device copy over the load, mirror, sync only for canEdit, flush only with entries),
// "Report, dispose" (P120b). Fakes: fetchImpl, storage and sync are vi.fn objects.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { Change } from './model/patches';
import type { ModelLoad } from '../lib/outbox/model-api';
import type { Actor, OutboxEntry, OutboxStorage, SavedObject } from '../lib/outbox/outbox';
import type { OutboxSync, SyncState } from '../lib/outbox/outbox-sync';
import type { ConflictList, ConflictListState } from '../lib/conflicts/conflict-list';

vi.mock('../lib/errors/capture', () => ({ captureBrowserError: vi.fn() }));

import { captureBrowserError } from '../lib/errors/capture';
import { openEditorSession } from './editor-session';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FLOOR = '33333333-3333-4333-8333-333333333333';
const ACTOR: Actor = {
  appUserId: '44444444-4444-4444-8444-444444444444',
  tenantId: '55555555-5555-4555-8555-555555555555',
  membershipId: '66666666-6666-4666-8666-666666666666',
};

const floor = (name: string) => ({
  type: 'floor',
  schemaVersion: 1,
  data: { name, order: 1 },
});

const modelOf = (canEdit: boolean): ModelLoad => ({
  project: { id: PROJECT, name: 'bravo', clientName: 'Zed Co' },
  viewer: { ...ACTOR, canEdit },
  lockEpoch: 0,
  objects: [{ id: FLOOR, ...floor('Floor 1'), updatedSeq: 1 }],
  invalid: [],
  numberHighs: { wall: 0, door: 0, window: 0 },
});

const entry = (projectId: string, name: string): OutboxEntry => ({
  projectId,
  id: FLOOR,
  baseSeq: 1,
  lockEpoch: 0,
  value: floor(name),
  rev: 1,
  queuedAt: 1,
});

function fakeStorage(list: () => Promise<OutboxEntry[]>) {
  const storage = {
    put: vi.fn(async () => {}),
    list: vi.fn(list),
    commit: vi.fn(async () => {}),
    drop: vi.fn(async () => {}),
    replaceMirror: vi.fn(async () => {}),
    moveToConflicts: vi.fn(async () => {}),
    listConflicts: vi.fn(async () => []),
    setConflictServer: vi.fn(async () => []),
    deleteConflicts: vi.fn(async () => []),
    requeue: vi.fn(async () => ({ kept: false })),
    setMirror: vi.fn(async () => {}),
    close: vi.fn(),
  };
  return storage satisfies OutboxStorage;
}

function fakeSync(): OutboxSync {
  const store = createStore<SyncState>()(() => ({
    status: 'idle',
    failures: 0,
    problem: null,
    lastSavedAt: null,
    conflictRev: 0,
  }));
  return {
    ...store,
    keepMine: vi.fn(async () => ({ kept: false })),
    enqueue: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
    retry: vi.fn(),
    dispose: vi.fn(),
  };
}

const respond = (model: ModelLoad) => vi.fn(async () => Response.json(model, { status: 200 }));

beforeEach(() => {
  vi.mocked(captureBrowserError).mockClear();
});

describe('EZD-120c editor session', () => {
  it('U5 fails: the answer to the load decides the kind, and no storage is opened', async () => {
    const createStorage = vi.fn();
    const answer = (fetchImpl: typeof fetch) =>
      openEditorSession(PROJECT, { fetchImpl, createStorage });
    const withError = (code: string, status: number) =>
      vi.fn(async () => Response.json({ error: { code } }, { status }));

    expect((await answer(withError('permission_denied', 403))).kind).toBe('no-access');
    expect((await answer(withError('project_not_found', 404))).kind).toBe('not-found');
    expect((await answer(withError('db_unavailable', 500))).kind).toBe('failed');
    expect((await answer(withError('not_signed_in', 401))).kind).toBe('failed');
    expect(
      (
        await answer(
          vi.fn(async () => {
            throw new TypeError('network');
          }),
        )
      ).kind,
    ).toBe('failed');
    expect(createStorage).not.toHaveBeenCalled();
  });

  it('U6 ready: the device copy goes over the load, the mirror is replaced, edits are queued, dispose closes', async () => {
    const model = modelOf(true);
    const storage = fakeStorage(async () => [entry(OTHER, 'Floor Z'), entry(PROJECT, 'Floor A')]);
    const sync = fakeSync();
    const createStorage = vi.fn(() => storage);
    const createSync = vi.fn(() => sync);
    const result = await openEditorSession(PROJECT, {
      fetchImpl: respond(model),
      createStorage,
      createSync,
    });
    if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`);
    const { session } = result;

    expect(session.model).toEqual(model);
    expect(session.sync).toBe(sync);
    expect(session.store.getState().objects.get(FLOOR)?.data.name).toBe('Floor A');
    expect(createStorage).toHaveBeenCalledTimes(1);
    expect(createStorage).toHaveBeenCalledWith(ACTOR);
    expect(storage.replaceMirror).toHaveBeenCalledTimes(1);
    expect(storage.replaceMirror).toHaveBeenCalledWith(PROJECT, model.objects);
    expect(createSync).toHaveBeenCalledTimes(1);
    expect(createSync).toHaveBeenCalledWith(expect.objectContaining({ actor: ACTOR, storage }));
    expect(sync.flush).toHaveBeenCalledTimes(1);

    const change: Change = { id: FLOOR, value: floor('Floor B') };
    session.store.applyEdit([change]);
    expect(sync.enqueue).toHaveBeenCalledTimes(1);
    expect(sync.enqueue).toHaveBeenCalledWith(PROJECT, 0, [change]);

    session.dispose();
    expect(sync.dispose).toHaveBeenCalledTimes(1);
    expect(storage.close).toHaveBeenCalledTimes(1);
  });

  it('U7 variants: no entries, view-only, and a device list that throws', async () => {
    // (a) an empty device list: nothing to flush
    const a = fakeStorage(async () => []);
    const syncA = fakeSync();
    const ra = await openEditorSession(PROJECT, {
      fetchImpl: respond(modelOf(true)),
      createStorage: () => a,
      createSync: () => syncA,
    });
    expect(ra.kind).toBe('ready');
    expect(syncA.flush).not.toHaveBeenCalled();

    // (b) view-only: no sync, the mirror is still replaced, nothing is queued
    const b = fakeStorage(async () => []);
    const createSyncB = vi.fn(() => fakeSync());
    const rb = await openEditorSession(PROJECT, {
      fetchImpl: respond(modelOf(false)),
      createStorage: () => b,
      createSync: createSyncB,
    });
    if (rb.kind !== 'ready') throw new Error(`expected ready, got ${rb.kind}`);
    expect(rb.session.sync).toBeNull();
    expect(createSyncB).not.toHaveBeenCalled();
    expect(b.replaceMirror).toHaveBeenCalledTimes(1);
    rb.session.store.applyEdit([{ id: FLOOR, value: floor('Floor B') }]);
    expect(b.put).not.toHaveBeenCalled();

    // (c) the device list throws: ready from the load alone, one report
    const boom = new Error('idb');
    const c = fakeStorage(async () => {
      throw boom;
    });
    const rc = await openEditorSession(PROJECT, {
      fetchImpl: respond(modelOf(true)),
      createStorage: () => c,
      createSync: () => fakeSync(),
    });
    if (rc.kind !== 'ready') throw new Error(`expected ready, got ${rc.kind}`);
    expect(rc.session.store.getState().objects.get(FLOOR)?.data.name).toBe('Floor 1');
    await vi.waitFor(() => expect(captureBrowserError).toHaveBeenCalledTimes(1));
    expect(vi.mocked(captureBrowserError).mock.calls[0][1]).toBe('editor.device_copy');
  });
  // EZD-294 W1 (vault/plans/EZD-294.md section 4 and step 12; Q-0629 (b); AC-EZD-294-2).
  it('EZD-294 W1 the session applies saved numbers of its own project', async () => {
    const WALL = '77777777-7777-4777-8777-777777777777';
    const model: ModelLoad = {
      ...modelOf(true),
      objects: [
        { id: FLOOR, ...floor('Floor 1'), updatedSeq: 1 },
        {
          id: WALL,
          type: 'wall',
          schemaVersion: 3,
          data: { attributes: { number: 5 } },
          updatedSeq: 1,
        },
      ],
    };
    let onSaved: ((projectId: string, saved: SavedObject[]) => void) | undefined;
    const createSync = vi.fn((o: { onSaved?: (projectId: string, saved: SavedObject[]) => void }) => {
      onSaved = o.onSaved;
      return fakeSync();
    });
    const result = await openEditorSession(PROJECT, {
      fetchImpl: respond(model),
      createStorage: () => fakeStorage(async () => []),
      createSync,
    });
    if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`);
    expect(onSaved).toBeDefined();
    onSaved!(PROJECT, [{ id: WALL, updatedSeq: 2, number: 6 }]);
    onSaved!('other', [{ id: WALL, updatedSeq: 3, number: 9 }]);
    const stored = result.session.store.getState().objects.get(WALL)!;
    expect((stored.data.attributes as Record<string, unknown>).number).toBe(6);
    expect(result.session.store.getState().numberHighs.wall).toBe(6);
  });
});

// EZD-299b T9 (vault/plans/EZD-299b.md section 4; AC-EZD-299-9; Decided D-Session).
function fakeConflicts(): ConflictList {
  const store = createStore<ConflictListState>()(() => ({ rows: [], server: 'idle' }));
  return {
    ...store,
    refresh: vi.fn(async () => {}),
    keepMine: vi.fn(async () => ({ ok: true }) as const),
    keepTheirs: vi.fn(async () => ({ ok: true }) as const),
    remove: vi.fn(async () => ({ ok: true }) as const),
    dispose: vi.fn(),
  };
}

describe('EZD-299b editor session conflicts', () => {
  it('EZD-299b T9 builds the conflict list over the storage and sync, refreshes it and disposes it first', async () => {
    const storage = fakeStorage(async () => []);
    const sync = fakeSync();
    const conflicts = fakeConflicts();
    const createConflicts = vi.fn(() => conflicts);
    const result = await openEditorSession(PROJECT, {
      fetchImpl: respond(modelOf(true)),
      createStorage: () => storage,
      createSync: () => sync,
      createConflicts,
    });
    if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`);
    const { session } = result;

    expect(createConflicts).toHaveBeenCalledTimes(1);
    expect(createConflicts).toHaveBeenCalledWith(
      expect.objectContaining({
        storage,
        sync,
        editor: expect.objectContaining({ projectId: PROJECT, lockEpoch: 0 }),
      }),
    );
    expect(session.conflicts).toBe(conflicts);
    expect(conflicts.refresh).toHaveBeenCalledTimes(1);

    session.dispose();
    expect(conflicts.dispose).toHaveBeenCalledTimes(1);
    expect(vi.mocked(conflicts.dispose).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sync.dispose).mock.invocationCallOrder[0],
    );
  });

  it('EZD-299b T9 a view-only session builds the list with no sync', async () => {
    const createConflicts = vi.fn(() => fakeConflicts());
    const result = await openEditorSession(PROJECT, {
      fetchImpl: respond(modelOf(false)),
      createStorage: () => fakeStorage(async () => []),
      createSync: () => fakeSync(),
      createConflicts,
    });
    if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`);
    expect(createConflicts).toHaveBeenCalledTimes(1);
    expect(createConflicts).toHaveBeenCalledWith(expect.objectContaining({ sync: null }));
  });
});

// EZD-299 U10 (vault/plans/EZD-299.md section 4; AC-EZD-299-6; interface C4): the device outbox of this actor, every
// project.
describe('EZD-299 editor session queued', () => {
  it('U10 queued() returns storage.list(), the entries of every project', async () => {
    const entries = [entry(OTHER, 'Floor Z'), entry(PROJECT, 'Floor A')];
    const storage = fakeStorage(async () => entries);
    const result = await openEditorSession(PROJECT, {
      fetchImpl: respond(modelOf(true)),
      createStorage: () => storage,
      createSync: () => fakeSync(),
      createConflicts: () => fakeConflicts(),
    });
    if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`);
    const listed = await result.session.queued();
    expect(listed).toEqual(entries);
    expect(listed.map((e) => e.projectId).sort()).toEqual([PROJECT, OTHER].sort());
    expect(storage.list).toHaveBeenCalled();
  });
});
