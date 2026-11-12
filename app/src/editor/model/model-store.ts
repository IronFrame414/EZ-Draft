// EZD-120b Build step 8 (vault/plans/EZD-120b.md section 3 model-store row; Decided "Patch", "Undo, redo",
// "Changed ids"; AC-EZD-120b-2, -3): the open model's store. An edit, undo or redo returns the changed ids in
// patch order, sets `lastChangedIds` and calls `onCommit` once with those changes; an empty one does nothing.
// EZD-294 Build step 11 (vault/plans/EZD-294.md Decided "Store highs", "Apply saved numbers"; Q-0625 (a);
// Q-0629 (b)): `numberHighs` only rises (undo and redo never lower it); `applySavedNumbers` puts the server's
// numbers in the open model without an edit.
import {
  NO_NUMBERS,
  numberKeyOf,
  objectNumber,
  raiseNumberHighs,
  withObjectNumber,
  type NumberHighs,
} from '@ezdraft/geometry';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { applyEditTo, makeEdit, type Change, type Edit, type Objects } from './patches';

export type ModelState = {
  objects: Objects;
  past: Edit[];
  future: Edit[];
  lastChangedIds: string[];
  numberHighs: NumberHighs;
};

export type ModelStore = StoreApi<ModelState> & {
  applyEdit(changes: Change[]): string[];
  undo(): string[];
  redo(): string[];
  applySavedNumbers(saved: readonly { id: string; number?: number }[]): string[];
  applyRemote(changes: Change[]): string[];
};

export function createModelStore(o: {
  objects: Objects;
  numberHighs?: NumberHighs;
  onCommit?: (changes: Change[]) => void;
}): ModelStore {
  const store = createStore<ModelState>()(() => ({
    objects: o.objects,
    past: [],
    future: [],
    lastChangedIds: [],
    numberHighs: raiseNumberHighs(o.numberHighs ?? NO_NUMBERS, o.objects.values()),
  }));

  const commit = (
    edit: Edit,
    direction: 'forward' | 'back',
    past: Edit[],
    future: Edit[],
  ): string[] => {
    const ids = edit.patches.map((p) => p.id);
    // Decided "Store highs": the values this commit applies raise the highs.
    const applied = edit.patches.flatMap((p) => {
      const v = direction === 'forward' ? p.after : p.before;
      return v === null ? [] : [v];
    });
    const current = store.getState();
    store.setState({
      objects: applyEditTo(current.objects, edit, direction),
      past,
      future,
      lastChangedIds: ids,
      numberHighs: raiseNumberHighs(current.numberHighs, applied),
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
    // Decided "Apply saved numbers": saved ids matched lower-cased (Q-0595 (a)); no edit, no onCommit.
    applySavedNumbers(saved) {
      const numbers = new Map<string, number>();
      for (const s of saved) if (s.number !== undefined) numbers.set(s.id.toLowerCase(), s.number);
      const current = store.getState();
      const ids: string[] = [];
      const replaced: ObjectValue[] = [];
      const objects = new Map(current.objects);
      for (const [id, value] of current.objects) {
        const n = numbers.get(id.toLowerCase());
        if (n === undefined || numberKeyOf(value) === null || objectNumber(value) === n) continue;
        const next = withObjectNumber(value, n);
        objects.set(id, next);
        ids.push(id);
        replaced.push(next);
      }
      if (ids.length === 0) return [];
      store.setState({ objects, numberHighs: raiseNumberHighs(current.numberHighs, replaced) });
      return ids;
    },
    // EZD-299b Build step 6 (vault/plans/EZD-299b.md Decided D-Remote): a change from the server, with no undo
    // step and no onCommit (nothing is queued).
    applyRemote(changes) {
      if (changes.length === 0) return [];
      const { objects, numberHighs } = store.getState();
      const edit = makeEdit(objects, changes);
      const ids = edit.patches.map((p) => p.id);
      // Decided "Store highs": the non-null values of the remote changes raise the highs.
      const applied = changes.flatMap((c) => (c.value === null ? [] : [c.value]));
      store.setState({
        objects: applyEditTo(objects, edit, 'forward'),
        lastChangedIds: ids,
        numberHighs: raiseNumberHighs(numberHighs, applied),
      });
      return ids;
    },
  };
}
