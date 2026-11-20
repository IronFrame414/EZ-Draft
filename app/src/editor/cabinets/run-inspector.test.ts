// EZD-419 (AC-EZD-419-1 "Selecting the island run shows its total and both tiles", AC-EZD-419-2 "picking a finish
// updates the run"). Expected values: board S03Plan's island run "3 boxes · 2 end panels", "B24 + DB24 + B24 + 2
// panels", 73 1/2" (24 + 24 + 24 + 2 × 3/4; board S04b "island cabinets 73 1/2"), finish "Shaker, Midnight".
import { describe, expect, it } from 'vitest';
import { cabinetSelect, cabinetView, modelObjects, NO_CABINET_SELECTION } from './cabinet-view';
import {
  isRunSelected,
  runCountertopChanges,
  runFinishChanges,
  runInspectorView,
} from './run-inspector';
import { apply, FLOOR, islandModel, ITEM, mid, RUN, TOP } from './test-utils/island-run';

describe('EZD-419 run inspector', () => {
  it('AC-EZD-419-1 the island run: title, contents, box list and 73 1/2" total, both selections', () => {
    const parsed = modelObjects(islandModel());
    const view = cabinetView(parsed, FLOOR)!;
    const r = runInspectorView(view, parsed);
    expect(r.id).toBe(RUN);
    expect(r.name).toBe('Island run');
    expect(r.boxCount).toBe(3);
    expect(r.fillerCount).toBe(0);
    expect(r.endPanelCount).toBe(2);
    expect(r.panelCount).toBe(0);
    expect(r.codes).toEqual(['B24', 'DB24', 'B24']);
    expect(r.panels).toBe(2);
    expect(r.total).toBe(73.5);
    expect(r.finish).toEqual({ kind: 'none' });
    expect(r.countertopIds).toEqual([TOP]);
    expect(r.countertop).toEqual({ kind: 'none' });
  });

  it('a click on the run selects the run, not a box', () => {
    const parsed = modelObjects(islandModel());
    const view = cabinetView(parsed, FLOOR)!;
    const s = cabinetSelect(NO_CABINET_SELECTION, { type: 'click', id: RUN });
    expect(isRunSelected(view, s.ids)).toBe(true);
    expect(isRunSelected(view, [mid(2)])).toBe(false);
    expect(isRunSelected(view, [RUN, mid(2)])).toBe(false);
    expect(isRunSelected(null, [RUN])).toBe(false);
  });

  it('AC-EZD-419-2 picking a finish sets it on every member of the run in one edit', () => {
    const objects = islandModel();
    const parsed = modelObjects(objects);
    const view = cabinetView(parsed, FLOOR)!;
    const changes = runFinishChanges(view, parsed, 'Shaker, Midnight');
    expect(changes.map((c) => c.id).sort()).toEqual([1, 2, 3, 4, 5].map(mid).sort());
    const after = modelObjects(apply(objects, changes));
    expect(after).toHaveLength(parsed.length);
    const r = runInspectorView(cabinetView(after, FLOOR)!, after);
    expect(r.finish).toEqual({ kind: 'one', value: 'Shaker, Midnight' });
    // Picking it again changes nothing.
    expect(runFinishChanges(cabinetView(after, FLOOR)!, after, 'Shaker, Midnight')).toEqual([]);
  });

  it('members with different finishes read Mixed', () => {
    const objects = islandModel();
    const parsed = modelObjects(objects);
    const view = cabinetView(parsed, FLOOR)!;
    const one = runFinishChanges(view, parsed, 'Shaker, Midnight').filter((c) => c.id === mid(2));
    const after = modelObjects(apply(objects, one));
    expect(runInspectorView(cabinetView(after, FLOOR)!, after).finish).toEqual({ kind: 'mixed' });
  });

  it('picking a countertop links the item to the piece over the run', () => {
    const objects = islandModel();
    const parsed = modelObjects(objects);
    const view = cabinetView(parsed, FLOOR)!;
    const changes = runCountertopChanges(view, parsed, ITEM);
    expect(changes.map((c) => c.id)).toEqual([TOP]);
    const after = modelObjects(apply(objects, changes));
    expect(after).toHaveLength(parsed.length);
    expect(runInspectorView(cabinetView(after, FLOOR)!, after).countertop).toEqual({
      kind: 'one',
      value: ITEM,
    });
  });

  it("a piece away from the run, or none, is not the run's countertop", () => {
    for (const objects of [islandModel(false), islandModel(true, { x: 200, y: 200 })]) {
      const parsed = modelObjects(objects);
      const view = cabinetView(parsed, FLOOR)!;
      expect(runInspectorView(view, parsed).countertopIds).toEqual([]);
      expect(runCountertopChanges(view, parsed, ITEM)).toEqual([]);
    }
  });
});
