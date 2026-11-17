// EZD-5604b S1-S3 (vault/plans/EZD-5604b.md section 4; AC-EZD-5604-4, -5, -7; Q-0637; L-048): the one open
// preview goes stale when a touched object changes in the open model by any mutation, and only then.
import { describe, expect, it, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createModelStore, type ModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { baseObjects, uid, withWalls } from '../tools/test-utils/fixtures';
import type { OkPreview } from './apply-reply';
import { createPreviewStore, EMPTY_PREVIEW_STATE, type PreviewStore } from './preview-store';

const R = withWalls(
  baseObjects(),
  1,
  [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 120 },
  ],
  false,
);

function h(v: ObjectValue, n: number): ObjectValue {
  const data = v.data as { attributes: Record<string, unknown> };
  return { ...v, data: { ...data, attributes: { ...data.attributes, height: n } } };
}

function P(touched: string[]): OkPreview {
  return {
    ok: true,
    changes: [],
    added: [],
    removed: [],
    updated: touched,
    touched,
    provisional: {},
  };
}

const at = (m: ModelStore, id: string) => m.getState().objects.get(id)!;

function setup(objects: Objects = R) {
  const model = createModelStore({ objects });
  const store = createPreviewStore({ store: model });
  const listener = vi.fn();
  store.subscribe(listener);
  return { model, store, listener };
}

const open = (store: PreviewStore, model: ModelStore, touched: string[]) =>
  store.open({
    preview: P(touched),
    prompt: 'add a door',
    entryId: 4,
    before: model.getState().objects,
  });

type Mutation = 'applyEdit' | 'undo' | 'redo' | 'applyRemote' | 'applySavedNumbers';

function prepare(model: ModelStore, kind: Mutation, x: string) {
  if (kind === 'undo') model.applyEdit([{ id: x, value: h(at(model, x), 90) }]);
  if (kind === 'redo') {
    model.applyEdit([{ id: x, value: h(at(model, x), 90) }]);
    model.undo();
  }
}

function mutate(model: ModelStore, kind: Mutation, x: string) {
  switch (kind) {
    case 'applyEdit':
      model.applyEdit([{ id: x, value: h(at(model, x), 90) }]);
      break;
    case 'undo':
      model.undo();
      break;
    case 'redo':
      model.redo();
      break;
    case 'applyRemote':
      model.applyRemote([{ id: x, value: h(at(model, x), 90) }]);
      break;
    case 'applySavedNumbers':
      model.applySavedNumbers([{ id: x, number: 7 }]);
      break;
  }
}

const MUTATIONS: Mutation[] = ['applyEdit', 'undo', 'redo', 'applyRemote', 'applySavedNumbers'];
const ROWS = MUTATIONS.flatMap((kind) => [
  { kind, touched: true },
  { kind, touched: false },
]);

describe('EZD-5604b preview store', () => {
  it.each(ROWS)('S1 $kind on a touched=$touched object', ({ kind, touched }) => {
    const { model, store, listener } = setup();
    const x = touched ? uid(1) : uid(2);
    prepare(model, kind, x);
    expect(open(store, model, [uid(1)])).toBe(true);
    listener.mockClear();
    const opened = store.getState();
    mutate(model, kind, x);
    if (touched) {
      expect(store.getState().stale).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      model.applyEdit([{ id: uid(1), value: h(at(model, uid(1)), 50) }]);
      expect(listener).toHaveBeenCalledTimes(1);
    } else {
      expect(store.getState().stale).toBe(false);
      expect(listener).toHaveBeenCalledTimes(0);
      expect(store.getState()).toBe(opened);
    }
  });

  it('S2 open checks the snapshot against the model, one preview at a time, ids any case', () => {
    // (a) the model changed a touched object after the snapshot was taken
    {
      const { model, store } = setup();
      model.applyEdit([{ id: uid(1), value: h(at(model, uid(1)), 90) }]);
      expect(store.open({ preview: P([uid(1)]), prompt: 'p', entryId: 1, before: R })).toBe(true);
      expect(store.getState().stale).toBe(true);
    }
    // (b) an untouched object changed
    {
      const { model, store } = setup();
      model.applyEdit([{ id: uid(2), value: h(at(model, uid(2)), 90) }]);
      expect(store.open({ preview: P([uid(1)]), prompt: 'p', entryId: 1, before: R })).toBe(true);
      expect(store.getState().stale).toBe(false);
    }
    // (c) a second open while one is open
    {
      const { model, store, listener } = setup();
      open(store, model, [uid(1)]);
      const first = store.getState();
      listener.mockClear();
      expect(open(store, model, [uid(2)])).toBe(false);
      expect(store.getState()).toBe(first);
      expect(listener).toHaveBeenCalledTimes(0);
    }
    // (d) touched spelled upper case
    {
      const { model, store } = setup();
      open(store, model, ['00000000-0000-4000-8000-000000000001'.toUpperCase()]);
      model.applyEdit([{ id: uid(1), value: h(at(model, uid(1)), 90) }]);
      expect(store.getState().stale).toBe(true);
    }
  });

  it('S3 replace, reject and dispose', () => {
    const { model, store, listener } = setup();
    open(store, model, [uid(1)]);
    store.replace(P([uid(2)]));
    expect(store.getState().prompt).toBe('add a door');
    expect(store.getState().entryId).toBe(4);
    expect(store.getState().preview?.touched).toEqual([uid(2)]);
    model.applyEdit([{ id: uid(1), value: h(at(model, uid(1)), 90) }]);
    expect(store.getState().stale).toBe(false);
    model.applyEdit([{ id: uid(2), value: h(at(model, uid(2)), 90) }]);
    expect(store.getState().stale).toBe(true);

    const objects = model.getState().objects;
    store.reject();
    expect(store.getState()).toEqual(EMPTY_PREVIEW_STATE);
    expect(model.getState().objects).toBe(objects);
    listener.mockClear();
    model.applyEdit([{ id: uid(2), value: h(at(model, uid(2)), 70) }]);
    expect(listener).toHaveBeenCalledTimes(0);
    store.reject();
    expect(listener).toHaveBeenCalledTimes(0);

    const other = setup();
    other.store.dispose();
    expect(open(other.store, other.model, [uid(1)])).toBe(false);
    expect(other.store.getState()).toEqual(EMPTY_PREVIEW_STATE);
  });
});
