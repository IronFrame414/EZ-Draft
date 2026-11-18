// EZD-405 (AC-EZD-405-1 "Dragging a B15 edge one step relabels it B18"; S04 Controls "Drag box side edge | Resizes
// width in the run increment (3") | Code updates (e.g. B15 to B18)", "Drag box | Reorders within the run; others
// shift"; S04 Validation "custom boxes allowed outside increments"). Expected values: the spec's 3" step and B15 to
// B18; board S04's run (3" filler, B15, DW24, SB36, B18, B21 = 117") so one step adds 3" to make 120"; its upper
// W1530 (15" wide, 30" tall); the seed line codes B9 ... B36, F3, F6 (assumptions.md EZD-401).
import { describe, expect, it } from 'vitest';
import type { CabinetBoxType, ModelObject } from '../schema';
import {
  cabinetCodeForWidth,
  cabinetEdgeSteps,
  cabinetSteppedWidth,
  insertAfterInCabinetRun,
  moveInCabinetRow,
  removeFromCabinetRun,
  resizeCabinetMember,
} from './edit';
import { cabinetRunTotal, objectLookup, type CabinetRun, type CabinetRunMember } from './run';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const box = (
  n: number,
  code: string,
  width: number,
  boxType: CabinetBoxType = 'base',
): CabinetRunMember => ({
  id: id(n),
  type: 'cabinet_box',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: {
      code,
      boxType,
      width,
      depth: boxType === 'wall' ? 12 : 24,
      height: boxType === 'wall' ? 30 : 34.5,
      faceLayout: 'door_1',
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  },
});
const filler = (n: number, width: number, scribe: number): CabinetRunMember => ({
  id: id(n),
  type: 'cabinet_filler',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: {
      code: `F${width}`,
      width,
      depth: 24,
      height: 34.5,
      scribe,
      catalogItemId: null,
      finish: null,
    },
  },
});

const members = (): CabinetRunMember[] => [
  filler(1, 3, 0.5),
  box(2, 'B15', 15),
  box(3, 'DW24', 24, 'appliance_panel'),
  box(4, 'SB36', 36, 'sink_base'),
  box(5, 'B18', 18),
  box(6, 'B21', 21),
  box(7, 'W1530', 15, 'wall'),
  box(8, 'W3030', 30, 'wall'),
];
const run = (): CabinetRun => ({
  id: id(99),
  type: 'cabinet_run',
  data: {
    geometry: { hostWallId: null, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
    level: LEVEL,
    attributes: { name: 'Back wall run', base: [1, 2, 3, 4, 5, 6].map(id), upper: [id(7), id(8)] },
  },
});

describe('EZD-405 box resize', () => {
  it('AC-EZD-405-1: B15 dragged one step wider is 18" and relabelled B18', () => {
    const b15 = box(2, 'B15', 15);
    const steps = cabinetEdgeSteps('right', 3);
    expect(steps).toBe(1);
    const next = resizeCabinetMember(b15, cabinetSteppedWidth(15, steps));
    expect(next?.data.attributes.width).toBe(18);
    expect(next?.data.attributes.code).toBe('B18');
    expect(next?.id).toBe(b15.id);
  });

  it('AC-EZD-405-1: the run total grows by the step, 117" to 120"; the others shift', () => {
    const all: ModelObject[] = members();
    expect(cabinetRunTotal(run(), objectLookup(all))).toBe(117);
    const b18 = resizeCabinetMember(all[1] as CabinetRunMember, 18);
    if (b18 === null) throw new Error('no change');
    const after = all.map((o) => (o.id === b18.id ? b18 : o));
    expect(cabinetRunTotal(run(), objectLookup(after))).toBe(120);
  });

  it('a drag snaps to whole 3" steps; under half a step is no step; the left edge grows to the left', () => {
    expect(cabinetEdgeSteps('right', 1.4)).toBe(0);
    expect(cabinetEdgeSteps('right', 1.6)).toBe(1);
    expect(cabinetEdgeSteps('right', 6)).toBe(2);
    expect(cabinetEdgeSteps('right', -3)).toBe(-1);
    expect(cabinetEdgeSteps('left', -3)).toBe(1);
    expect(cabinetEdgeSteps('left', 3)).toBe(-1);
  });

  it('one step narrower is B12; a box never goes under one 3" step', () => {
    expect(cabinetSteppedWidth(15, -1)).toBe(12);
    expect(cabinetSteppedWidth(15, 2)).toBe(21);
    expect(cabinetSteppedWidth(9, -5)).toBe(3);
    expect(resizeCabinetMember(box(2, 'B15', 15), 12)?.data.attributes.code).toBe('B12');
  });

  it('a custom 16 1/2" box steps onto the 3" grid: 18" wider, 15" narrower', () => {
    expect(cabinetSteppedWidth(16.5, 1)).toBe(18);
    expect(cabinetSteppedWidth(16.5, -1)).toBe(15);
    expect(cabinetSteppedWidth(16.5, 0)).toBe(16.5);
  });

  it('codes carry the width after their letters: W1530 to W1830, SB36 to SB33, F3 to F6; other codes stay', () => {
    expect(cabinetCodeForWidth('W1530', 15, 18)).toBe('W1830');
    expect(cabinetCodeForWidth('SB36', 36, 33)).toBe('SB33');
    expect(cabinetCodeForWidth('F3', 3, 6)).toBe('F6');
    expect(cabinetCodeForWidth('B9', 9, 12)).toBe('B12');
    expect(cabinetCodeForWidth('PANTRY', 18, 21)).toBe('PANTRY');
    expect(cabinetCodeForWidth('B24', 15, 18)).toBe('B24');
  });

  it('a filler cut under its scribe keeps a scribe no wider than itself; no change is null', () => {
    const f = resizeCabinetMember(filler(1, 6, 4.5), 3);
    expect(f?.data.attributes.width).toBe(3);
    expect(f?.type === 'cabinet_filler' ? f.data.attributes.scribe : null).toBe(3);
    expect(f?.data.attributes.code).toBe('F3');
    expect(resizeCabinetMember(box(2, 'B15', 15), 15)).toBeNull();
  });
});

describe('EZD-405 reorder, delete, duplicate', () => {
  it('B15 dragged after SB36 lands third; the others shift up', () => {
    const r = moveInCabinetRow(run(), id(2), 3);
    expect(r?.data.attributes.base).toEqual([1, 3, 4, 2, 5, 6].map(id));
    expect(r?.data.attributes.upper).toEqual([id(7), id(8)]);
  });

  it('an upper moves only within the upper row; a drop where it stands is no change', () => {
    expect(moveInCabinetRow(run(), id(8), 0)?.data.attributes.upper).toEqual([id(8), id(7)]);
    expect(moveInCabinetRow(run(), id(8), 1)).toBeNull();
    expect(moveInCabinetRow(run(), id(42), 0)).toBeNull();
  });

  it('delete takes the boxes out of both rows', () => {
    const r = removeFromCabinetRun(run(), [id(4), id(7)]);
    expect(r?.data.attributes.base).toEqual([1, 2, 3, 5, 6].map(id));
    expect(r?.data.attributes.upper).toEqual([id(8)]);
    expect(removeFromCabinetRun(run(), [id(42)])).toBeNull();
  });

  it('a duplicate stands right after its original', () => {
    const r = insertAfterInCabinetRun(run(), id(2), id(50));
    expect(r?.data.attributes.base).toEqual([id(1), id(2), id(50), id(3), id(4), id(5), id(6)]);
  });
});
