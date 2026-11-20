// EZD-405 (AC-EZD-405-1 "Dragging a B15 edge one step relabels it B18"; S04 Controls "Shift+click box | Adds to
// selection", "Drag box | Reorders within the run; others shift", "Drag box side edge | Resizes width in the run
// increment (3") | Code updates (e.g. B15 to B18)", "Delete / Backspace | Removes selected box(es); run total
// updates", "Ctrl/Cmd+Z ... Undo / redo"). Expected values: board S04's run (3" filler, B15, DW24, SB36, B18, B21 =
// 117"; uppers W1530, W3030; heights 36", 18", 30"), the spec's 3" step and B15 to B18.
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import {
  NO_CABINET_SELECTION,
  cabinetDeleteChanges,
  cabinetDropIndex,
  cabinetDuplicateChanges,
  cabinetHeightChanges,
  cabinetReorderChanges,
  cabinetResizeChanges,
  cabinetSelect,
  cabinetView,
  modelObjects,
} from './cabinet-view';
import { boardModel, CAB_FLOOR, CAB_RUN, cabId } from './test-utils/board-run';

const viewOf = (objects: ReturnType<typeof boardModel>) => {
  const v = cabinetView(modelObjects(objects), CAB_FLOOR);
  if (v === null) throw new Error('no run');
  return v;
};
const codeOf = (objects: ReturnType<typeof boardModel>, id: string) =>
  (objects.get(id)?.data.attributes as { code: string; width: number } | undefined) ?? null;

describe('EZD-405 box edits as model changes', () => {
  it('AC-EZD-405-1: B15 one step wider is saved as B18, 18" wide; the chain reads 3, 18, 24, 36, 18, 21 = 120"; undo puts B15 back', () => {
    const store = createModelStore({ objects: boardModel() });
    const objects = store.getState().objects;
    const v = viewOf(objects);
    const changes = cabinetResizeChanges(v, modelObjects(objects), cabId(2), 18);
    expect(changes).toHaveLength(1);
    store.applyEdit(changes);
    expect(codeOf(store.getState().objects, cabId(2))).toMatchObject({ code: 'B18', width: 18 });
    const after = viewOf(store.getState().objects);
    expect(after.layout.chain.map((c) => c.width)).toEqual([3, 18, 24, 36, 18, 21]);
    expect(after.summary.total).toBe(120);
    store.undo();
    expect(codeOf(store.getState().objects, cabId(2))).toMatchObject({ code: 'B15', width: 15 });
    store.redo();
    expect(codeOf(store.getState().objects, cabId(2))).toMatchObject({ code: 'B18', width: 18 });
  });

  it('a resize to the same width, or of an id not in the run, changes nothing', () => {
    const objects = boardModel();
    const v = viewOf(objects);
    expect(cabinetResizeChanges(v, modelObjects(objects), cabId(2), 15)).toEqual([]);
    expect(cabinetResizeChanges(v, modelObjects(objects), CAB_RUN, 18)).toEqual([]);
  });

  it('B15 dropped past the middle of SB36 lands after it; the run is the only object written', () => {
    const objects = boardModel();
    const v = viewOf(objects);
    // B15 stands 3..18; DW24 18..42 (middle 30); SB36 42..78 (middle 60); a drop at 70 is past both middles.
    expect(cabinetDropIndex(v, cabId(2), 70)).toBe(3);
    expect(cabinetDropIndex(v, cabId(2), 10)).toBe(1);
    const changes = cabinetReorderChanges(v, cabId(2), 3);
    expect(changes.map((c) => c.id)).toEqual([CAB_RUN]);
    const store = createModelStore({ objects });
    store.applyEdit(changes);
    const after = viewOf(store.getState().objects);
    expect(after.layout.chain.map((c) => c.width)).toEqual([3, 24, 36, 15, 18, 21]);
    expect(after.summary.total).toBe(117);
  });

  it('Delete takes SB36 and W1530 out: 81" run, 4 boxes, both objects removed', () => {
    const store = createModelStore({ objects: boardModel() });
    const v = viewOf(store.getState().objects);
    store.applyEdit(cabinetDeleteChanges(v, [cabId(4), cabId(7)]));
    const s = store.getState().objects;
    expect(s.has(cabId(4))).toBe(false);
    expect(s.has(cabId(7))).toBe(false);
    const after = viewOf(s);
    expect(after.summary.total).toBe(81);
    expect(after.summary.boxCount).toBe(4);
    expect(after.layout.upper.map((u) => u.code)).toEqual(['W3030']);
    expect(cabinetDeleteChanges(v, [])).toEqual([]);
  });

  it('Duplicate puts a copy of B18 right after it and returns the copy to select', () => {
    const store = createModelStore({ objects: boardModel() });
    const objects = store.getState().objects;
    const copy = 'c0000000-0000-4000-8000-000000000999';
    const r = cabinetDuplicateChanges(
      viewOf(objects),
      modelObjects(objects),
      [cabId(5)],
      () => copy,
    );
    expect(r.ids).toEqual([copy]);
    store.applyEdit(r.changes);
    const after = viewOf(store.getState().objects);
    expect(after.layout.chain.map((c) => c.width)).toEqual([3, 15, 24, 36, 18, 18, 21]);
    expect(after.layout.base[5]).toMatchObject({ id: copy, code: 'B18' });
  });

  it('typed heights: Upper 36" sets both uppers to 36"; Base 36" keeps the 34 1/2" boxes; Base 37 1/2" makes them 36"', () => {
    const objects = boardModel();
    const v = viewOf(objects);
    const up = cabinetHeightChanges(v, modelObjects(objects), 'upper', 36);
    expect(up.map((c) => c.id)).toEqual([cabId(7), cabId(8)]);
    expect(cabinetHeightChanges(v, modelObjects(objects), 'base', 36)).toEqual([]);
    const store = createModelStore({ objects });
    store.applyEdit(cabinetHeightChanges(v, modelObjects(objects), 'base', 37.5));
    const base = viewOf(store.getState().objects).layout.heights.find((h) => h.kind === 'base');
    expect(base?.to).toBe(37.5);
  });
});

describe('EZD-405 Shift+click', () => {
  it('adds a box to the selection, a second Shift+click takes it out, a plain click selects one', () => {
    let s = cabinetSelect(NO_CABINET_SELECTION, { type: 'click', id: cabId(2) });
    s = cabinetSelect(s, { type: 'click', id: cabId(5), shift: true });
    expect(s.ids).toEqual([cabId(2), cabId(5)]);
    s = cabinetSelect(s, { type: 'click', id: cabId(2).toUpperCase(), shift: true });
    expect(s.ids).toEqual([cabId(5)]);
    expect(cabinetSelect(s, { type: 'click', id: null, shift: true }).ids).toEqual([cabId(5)]);
    expect(cabinetSelect(s, { type: 'click', id: cabId(6) }).ids).toEqual([cabId(6)]);
    expect(cabinetSelect(s, { type: 'set', ids: [] }).ids).toEqual([]);
  });
});
