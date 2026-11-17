// EZD-5605 T11 (vault/plans/EZD-5605.md section 4; D-Saved edit; AC-EZD-5605-1; AC-EZD-217-11): an already saved
// change goes in the model as one undo step without being saved again; its undo saves the reverse as usual.
import { describe, expect, it, vi } from 'vitest';
import { createModelStore } from '../model/model-store';
import type { Change } from '../model/patches';
import { applySavedEdit } from './accept';

const val = (n: number) => ({ type: 'floor', schemaVersion: 1, data: { name: `F${n}`, order: n } });

describe('EZD-5605 applySavedEdit', () => {
  it('T11 one step, redo cleared, no onCommit; one undo takes all of it back and saves', () => {
    const onCommit = vi.fn((_c: Change[]) => {});
    const B0 = val(2);
    const C0 = val(3);
    const store = createModelStore({
      objects: new Map([
        ['B', B0],
        ['C', C0],
      ]),
      onCommit,
    });
    store.applyEdit([{ id: 'X', value: val(9) }]);
    store.undo();
    expect(store.getState().future).toHaveLength(1);
    onCommit.mockClear();
    const pastBefore = store.getState().past.length;

    const A1 = val(1);
    const B1 = val(20);
    const ids = applySavedEdit(store, [
      { id: 'A', value: A1 },
      { id: 'B', value: B1 },
      { id: 'C', value: null },
    ]);
    expect(ids).toEqual(['A', 'B', 'C']);
    expect(onCommit).not.toHaveBeenCalled();
    const s = store.getState();
    expect(s.past).toHaveLength(pastBefore + 1);
    expect(s.future).toEqual([]);
    expect(s.lastChangedIds).toEqual(['A', 'B', 'C']);
    expect(s.objects.get('A')).toBe(A1);
    expect(s.objects.get('B')).toBe(B1);
    expect(s.objects.has('C')).toBe(false);

    store.undo();
    const u = store.getState();
    expect(u.objects.has('A')).toBe(false);
    expect(u.objects.get('B')).toBe(B0);
    expect(u.objects.get('C')).toBe(C0);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]![0]).toEqual([
      { id: 'A', value: null },
      { id: 'B', value: B0 },
      { id: 'C', value: C0 },
    ]);

    const before = store.getState();
    expect(applySavedEdit(store, [])).toEqual([]);
    expect(store.getState()).toBe(before);
  });
});
