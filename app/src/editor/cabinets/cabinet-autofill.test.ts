// EZD-408 (AC-EZD-408-1 "a 117 1/2" empty wall returns boxes whose widths are multiples of 3" plus fillers, with the
// total inside the scribe allowance"; S04 Controls "Auto-fill run ... Existing boxes are replaced only after
// confirm"; 12 Acceptance · Cabinets "total shown vs wall"). Expected values worked by hand from the seeded line (B9 to
// B36, F3) on board S04's 117 1/2" wall: F3 at each end leaves 111 1/2" = 36 + 36 + 36 + 3 1/2; the 3 1/2" and the far
// F3 make F6 with 1/2" scribe; total 117". On the board run the DW24 and SB36 stay: F3, B15, DW24, SB36, B36, F3 with
// 1/2" scribe.
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import {
  cabinetAutoFillChanges,
  cabinetView,
  cabinetViewFit,
  modelObjects,
} from './cabinet-view';
import { boardModel, cabId, CAB_FLOOR, emptyRunModel } from './test-utils/board-run';
import type { Objects } from '../model/patches';

const viewOf = (objects: Objects) => {
  const v = cabinetView(modelObjects(objects), CAB_FLOOR);
  if (v === null) throw new Error('no run');
  return v;
};
let n = 0;
const newId = () => `d0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const codes = (objects: Objects) => viewOf(objects).layout.base.map((s) => s.code);

describe('EZD-408 Auto-fill run as model changes', () => {
  it('AC-EZD-408-1: the empty 117 1/2" run is filled with B36 boxes and fillers; the fit chip shows it fits', () => {
    const store = createModelStore({ objects: emptyRunModel() });
    const objects = store.getState().objects;
    const r = cabinetAutoFillChanges(viewOf(objects), modelObjects(objects), 3, newId);
    expect(r.fill).not.toBeNull();
    store.applyEdit(r.changes);
    const after = viewOf(store.getState().objects);
    expect(codes(store.getState().objects)).toEqual(['F3', 'B36', 'B36', 'B36', 'F6']);
    for (const s of after.layout.base.filter((x) => x.kind === 'box')) {
      expect(s.width % 3).toBe(0);
      expect(s.boxType).toBe('base');
    }
    expect(after.summary).toMatchObject({ total: 117, boxCount: 3, fillerCount: 2, scribe: 0.5 });
    const fit = cabinetViewFit(after, null);
    expect(fit).toMatchObject({ fits: true, total: 117, wallLength: 117.5, scribe: 0.5, gap: 0.5 });
  });

  it('replaces the board run\'s boxes but keeps DW24 and SB36; the old ones are removed; the uppers stay; one undo restores it', () => {
    const store = createModelStore({ objects: boardModel() });
    const objects = store.getState().objects;
    const r = cabinetAutoFillChanges(viewOf(objects), modelObjects(objects), 3, newId);
    store.applyEdit(r.changes);
    const now = store.getState().objects;
    expect(codes(now)).toEqual(['F3', 'B15', 'DW24', 'SB36', 'B36', 'F3']);
    const base = viewOf(now).run.data.attributes.base;
    expect(base[2]).toBe(cabId(3));
    expect(base[3]).toBe(cabId(4));
    for (const gone of [1, 2, 5, 6]) expect(now.has(cabId(gone))).toBe(false);
    expect(viewOf(now).run.data.attributes.upper).toEqual([cabId(7), cabId(8)]);
    expect(cabinetViewFit(viewOf(now), null)?.fits).toBe(true);
    store.undo();
    expect(codes(store.getState().objects)).toEqual(['F3', 'B15', 'DW24', 'SB36', 'B18', 'B21']);
  });

  it('new boxes carry the library rows\' faces: B36 is drawer + 2 doors; new members are status New on the run floor', () => {
    const objects = emptyRunModel();
    const r = cabinetAutoFillChanges(viewOf(objects), modelObjects(objects), 3, newId);
    const box = r.changes.find(
      (c) => c.value?.type === 'cabinet_box',
    )?.value?.data as { status: string; level: string; attributes: Record<string, unknown> };
    expect(box.status).toBe('new');
    expect(box.level).toBe(CAB_FLOOR);
    expect(box.attributes).toMatchObject({
      code: 'B36',
      width: 36,
      depth: 24,
      height: 34.5,
      faceLayout: 'drawer_doors_2',
      hingeSide: 'pair',
    });
  });
});
