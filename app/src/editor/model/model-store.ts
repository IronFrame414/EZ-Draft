// EZD-120b Build step 8 (vault/plans/EZD-120b.md section 3 model-store row; Decided "Patch", "Undo, redo",
// "Changed ids"; AC-EZD-120b-2, -3): the open model's store. An edit, undo or redo returns the changed ids in
// patch order, sets `lastChangedIds` and calls `onCommit` once with those changes; an empty one does nothing.
import { createStore, type StoreApi } from 'zustand/vanilla';
import { applyEditTo, makeEdit, type Change, type Edit, type Objects } from './patches';

export type ModelState = { objects: Objects; past: Edit[]; future: Edit[]; lastChangedIds: string[] };

export type ModelStore = StoreApi<ModelState> & {
  applyEdit(changes: Change[]): string[];
  undo(): string[];
  redo(): string[];
};

export function createModelStore(o: {
  objects: Objects;
  onCommit?: (changes: Change[]) => void;
}): ModelStore {
  const store = createStore<ModelState>()(() => ({
    objects: o.objects,
    past: [],
    future: [],
    lastChangedIds: [],
  }));

  const commit = (
    edit: Edit,
    direction: 'forward' | 'back',
    past: Edit[],
    future: Edit[],
  ): string[] => {
    const ids = edit.patches.map((p) => p.id);
    store.setState({
      objects: applyEditTo(store.getState().objects, edit, direction),
      past,
      future,
      lastChangedIds: ids,
    });
    o.onCommit?.(
      edit.patches.map((p) => ({ id: p.id, value: direction === 'forward' ? p.after : p.before })),
    );
    return ids;
  };

  return {
    ...store,
    applyEdit(changes) {
      if (changes.length === 0) return [];
      const { objects, past } = store.getState();
      const edit = makeEdit(objects, changes);
      return commit(edit, 'forward', [...past, edit], []);
    },
    undo() {
      const { past, future } = store.getState();
      const edit = past.at(-1);
      if (edit === undefined) return [];
      return commit(edit, 'back', past.slice(0, -1), [...future, edit]);
    },
    redo() {
      const { past, future } = store.getState();
      const edit = future.at(-1);
      if (edit === undefined) return [];
      return commit(edit, 'forward', [...past, edit], future.slice(0, -1));
    },
  };
}
