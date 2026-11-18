// EZD-404 (S04 Controls "Click box (plan strip or elevation) | Selects that box; same box highlights in both views",
// "Esc | Clears selection"; AC-EZD-404-1, -2). Expected values: board S04's run (fixtures.ts), "5 boxes", chain total 117".
import { describe, expect, it } from 'vitest';
import {
  NO_CABINET_SELECTION,
  cabinetSelect,
  cabinetView,
  isCabinetSelected,
  modelObjects,
} from './cabinet-view';
import { boardModel, boardModelWallMoved, CAB_FLOOR, CAB_RUN, cabId } from './test-utils/board-run';

describe('EZD-404 cabinet view', () => {
  it('opens the first run on the open floor with its layout, counts and elevation letter', () => {
    const v = cabinetView(modelObjects(boardModel()), CAB_FLOOR);
    expect(v?.run.id).toBe(CAB_RUN);
    expect(v?.summary.boxCount).toBe(5);
    expect(v?.summary.fillerCount).toBe(1);
    expect(v?.layout.total).toBe(117);
    expect(v?.layout.chain.reduce((s, c) => s + c.width, 0)).toBe(117);
    expect(v?.letter).toBe('A');
    expect(v?.elevations).toEqual(['A']);
    expect(v?.layout.wall).toEqual({ from: 0, to: 117.5 });
  });

  it('no run on the floor: nothing to open', () => {
    expect(
      cabinetView(modelObjects(boardModel()), '22222222-2222-4222-8222-222222222222'),
    ).toBeNull();
    expect(cabinetView([], null)).toBeNull();
  });

  it('a click selects one box, another click moves it, a click off every box or Esc clears', () => {
    let s = cabinetSelect(NO_CABINET_SELECTION, { type: 'click', id: cabId(4) });
    expect(s.ids).toEqual([cabId(4)]);
    expect(isCabinetSelected(s, cabId(4).toUpperCase())).toBe(true);
    s = cabinetSelect(s, { type: 'click', id: cabId(2) });
    expect(s.ids).toEqual([cabId(2)]);
    expect(cabinetSelect(s, { type: 'click', id: null }).ids).toEqual([]);
    expect(cabinetSelect(s, { type: 'escape' }).ids).toEqual([]);
    const h = cabinetSelect(s, { type: 'hover', id: cabId(5) });
    expect(h).toEqual({ ids: [cabId(2)], hoveredId: cabId(5) });
    expect(cabinetSelect(h, { type: 'hover', id: cabId(5) })).toBe(h);
  });
});

// EZD-410 (AC-EZD-410-1 "A wall move that strands a cabinet flags it red"; S04 Validation). The board run starts at
// (0,0) on its 117 1/2" wall's line; a 6" move off it leaves the run standing where it was, off the wall.
describe('EZD-410 run off its wall', () => {
  it('the board run is on its wall', () => {
    expect(cabinetView(modelObjects(boardModel()), CAB_FLOOR)?.offWall).toBe(false);
  });

  it('AC-EZD-410-1: after the wall moves 6" away the run reads off its wall', () => {
    expect(cabinetView(boardModelWallMoved({ x: 0, y: 6 }), CAB_FLOOR)?.offWall).toBe(true);
  });

  it('a 12" slide along the wall line keeps it on (the wall still runs 12 .. 129 1/2 behind it)', () => {
    expect(cabinetView(boardModelWallMoved({ x: 12, y: 0 }), CAB_FLOOR)?.offWall).toBe(false);
  });
});
