// EZD-5605 T12 (vault/plans/EZD-5605.md section 4; D-Routed store; AC-EZD-5605-6): the routed store reports and
// edits its target; switching tells listeners once with the state given; the base's changes are not passed on while
// routed elsewhere, and are again after switching back.
import { describe, expect, it, vi } from 'vitest';
import { createModelStore, type ModelState } from './model-store';
import { createRoutedStore } from './routed-store';

const val = (n: number) => ({ type: 'floor', schemaVersion: 1, data: { name: `F${n}`, order: n } });

describe('EZD-5605 routed store', () => {
  it('T12 route, edit, undo and route back', () => {
    const a = val(1);
    const base = createModelStore({ objects: new Map([['A', a]]) });
    const scratch = createModelStore({
      objects: new Map([
        ['A', a],
        ['D', val(4)],
      ]),
    });
    const routed = createRoutedStore(base);
    const listener = vi.fn((_s: ModelState, _p: ModelState) => {});
    routed.subscribe(listener);
    expect(routed.getState()).toBe(base.getState());

    const into = { ...scratch.getState(), lastChangedIds: ['D'] };
    routed.route(scratch, into);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0]).toBe(into);
    expect(listener.mock.calls[0]![1]).toBe(base.getState());
    expect(routed.getState()).toBe(into);

    const basePast = base.getState().past;
    routed.applyEdit([{ id: 'A', value: val(10) }]);
    expect(scratch.getState().past).toHaveLength(1);
    expect(routed.getState()).toBe(scratch.getState());
    routed.undo();
    expect(scratch.getState().objects.get('A')).toBe(a);
    expect(base.getState().past).toBe(basePast);
    expect(listener).toHaveBeenCalledTimes(3);

    base.applyRemote([{ id: 'C', value: val(30) }]);
    expect(listener).toHaveBeenCalledTimes(3);

    const back = { ...base.getState(), lastChangedIds: ['A', 'C', 'D'] };
    routed.route(null, back);
    expect(listener).toHaveBeenCalledTimes(4);
    expect(routed.getState()).toBe(back);
    base.applyRemote([{ id: 'A', value: val(11) }]);
    expect(listener).toHaveBeenCalledTimes(5);
    expect(routed.getState()).toBe(base.getState());
    scratch.applyEdit([{ id: 'A', value: val(12) }]);
    expect(listener).toHaveBeenCalledTimes(5);
  });
});
