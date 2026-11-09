// EZD-120b U1, U2 (vault/plans/EZD-120b.md section 4; AC-EZD-120b-2, -3). Expected values: Decided "Patch",
// "Undo, redo", "Changed ids". v(n) is the plan's unit value.
import { describe, expect, it, vi } from 'vitest';
import { v } from '../../../test-harness/outbox/sync-support';
import { applyEditTo, makeEdit } from './patches';
import { createModelStore } from './model-store';

const mapOf = (ids: string[]) => new Map(ids.map((id, i) => [id, v(i + 1)]));

describe('EZD-120b model store', () => {
  it('U1 edits, undoes and redoes with the same Edit moving between past and future', () => {
    const store = createModelStore({ objects: mapOf(['A', 'B', 'C']) });
    const oldA = store.getState().objects.get('A');

    store.applyEdit([{ id: 'A', value: v(10) }]);
    const edit = store.getState().past.at(-1);
    expect(edit).toBeDefined();
    expect(store.getState().objects.get('A')).toEqual(v(10));

    store.undo();
    expect(store.getState().future.at(-1)).toBe(edit);
    expect(store.getState().objects.get('A')).toEqual(oldA);

    store.redo();
    expect(store.getState().past.at(-1)).toBe(edit);
    expect(store.getState().objects.get('A')).toEqual(v(10));

    store.applyEdit([{ id: 'D', value: v(4) }]);
    expect(store.getState().objects.has('D')).toBe(true);
    expect(store.getState().future).toHaveLength(0);
    store.undo();
    expect(store.getState().objects.has('D')).toBe(false);

    const oldB = store.getState().objects.get('B');
    store.applyEdit([{ id: 'B', value: null }]);
    expect(store.getState().objects.has('B')).toBe(false);
    store.undo();
    expect(store.getState().objects.get('B')).toEqual(oldB);
  });

  it('U1 makeEdit sets before and after, and applyEditTo applies both directions', () => {
    const objects = mapOf(['A', 'B']);
    const edit = makeEdit(objects, [
      { id: 'A', value: v(10) },
      { id: 'B', value: null },
      { id: 'D', value: v(4) },
    ]);
    const byId = new Map(edit.patches.map((p) => [p.id, p]));
    expect(edit.patches.map((p) => p.id)).toEqual(['A', 'B', 'D']);
    expect(byId.get('A')).toEqual({ id: 'A', before: v(1), after: v(10) });
    expect(byId.get('B')).toEqual({ id: 'B', before: v(2), after: null });
    expect(byId.get('D')).toEqual({ id: 'D', before: null, after: v(4) });
    const forward = applyEditTo(objects, edit, 'forward');
    expect(forward.get('A')).toEqual(v(10));
    expect(forward.has('B')).toBe(false);
    expect(forward.get('D')).toEqual(v(4));
    const back = applyEditTo(forward, edit, 'back');
    expect([...back.entries()]).toEqual([...objects.entries()].map(([k, x]) => [k, x]));
  });

  it('U2 reports changed ids in patch order, calls onCommit once, keeps other values and refuses a repeated id', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const objects = mapOf(ids);
    const originals = new Map(objects);
    const onCommit = vi.fn();
    const store = createModelStore({ objects, onCommit });

    const changes = [
      { id: 'B', value: v(20) },
      { id: 'C', value: v(30) },
    ];
    const returned = store.applyEdit(changes);
    expect(returned).toEqual(['B', 'C']);
    expect(store.getState().lastChangedIds).toEqual(['B', 'C']);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(changes);
    const after = store.getState().objects;
    expect(after).not.toBe(objects);
    for (const id of ids.filter((i) => i !== 'B' && i !== 'C')) {
      expect(after.get(id)).toBe(originals.get(id));
    }
    expect(after.get('B')).toEqual(v(20));

    const before = store.getState();
    expect(() =>
      store.applyEdit([
        { id: 'B', value: v(21) },
        { id: 'B', value: v(22) },
      ]),
    ).toThrow('duplicate_object_id');
    expect(store.getState().objects).toBe(before.objects);
    expect(store.getState().past).toHaveLength(before.past.length);
    expect(onCommit).toHaveBeenCalledTimes(1);

    expect(store.applyEdit([])).toEqual([]);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(store.getState().past).toHaveLength(before.past.length);
  });
});

// EZD-299b T5 (vault/plans/EZD-299b.md section 4; AC-EZD-299-2; Decided D-Remote): a change that came from the
// server goes into the objects without an edit, a queue entry or an undo step.
describe('EZD-299b model store applyRemote', () => {
  it('EZD-299b T5 applies remote changes with no undo step and no onCommit, and refuses a repeated id', () => {
    const onCommit = vi.fn();
    const store = createModelStore({ objects: new Map([['A', v(1)]]), onCommit });
    store.applyEdit([{ id: 'A', value: v(2) }]);
    onCommit.mockClear();
    expect(store.getState().past).toHaveLength(1);

    const returned = store.applyRemote([
      { id: 'A', value: v(9) },
      { id: 'B', value: null },
    ]);
    expect(returned).toEqual(['A', 'B']);
    expect(store.getState().objects.get('A')).toEqual(v(9));
    expect(store.getState().lastChangedIds).toEqual(['A', 'B']);
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().future).toHaveLength(0);
    expect(onCommit).toHaveBeenCalledTimes(0);

    const state = store.getState();
    expect(store.applyRemote([])).toEqual([]);
    expect(store.getState()).toBe(state);

    expect(() =>
      store.applyRemote([
        { id: 'A', value: v(3) },
        { id: 'A', value: v(4) },
      ]),
    ).toThrow('duplicate_object_id');
    expect(onCommit).toHaveBeenCalledTimes(0);
  });
});
