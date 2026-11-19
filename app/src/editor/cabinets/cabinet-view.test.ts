// EZD-404 (S04 Controls "Click box (plan strip or elevation) | Selects that box; same box highlights in both views",
// "Esc | Clears selection"; AC-EZD-404-1, -2). Expected values: board S04's run (fixtures.ts), "5 boxes", chain total 117".
import { describe, expect, it } from 'vitest';
import {
  NO_CABINET_SELECTION,
  cabinetSelect,
  cabinetView,
  isCabinetSelected,
  modelObjects,
  wallTileAddChanges,
  wallTileChanges,
  wallTileStart,
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

// EZD-733 (AC-EZD-733-1 "Changing the start point moves the cuts on the elevation"). Board wall: 117 1/2" long, the run
// on its room face. Add lays 12" x 24" tile with a 1/8" joint from the wall's left end at the floor; the pitch along
// is 12 1/8", so the tenth column starts at 9 x 12.125 = 109.125" and is cut to 117.5 - 109.125 = 8.375". Started 6"
// from the left the first column is cut to 6 - 0.125 = 5.875" (the joint before the 6" tile).
describe('EZD-733 wall tile edits', () => {
  const ids = () => {
    let n = 0;
    return () => `d0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  };
  const withTile = () => {
    const objects = new Map(boardModel());
    const v = cabinetView(modelObjects(objects), CAB_FLOOR)!;
    const [add] = wallTileAddChanges(v, ids());
    objects.set(add!.id, add!.value!);
    return { objects, view: cabinetView(modelObjects(objects), CAB_FLOOR)! };
  };
  const cutXs = (view: ReturnType<typeof withTile>['view']) =>
    [
      ...new Set(
        view.layout
          .tile!.pieces.filter((p) => p.cut)
          .map((p) => Math.min(...p.points.map((q) => q.x))),
      ),
    ].sort((a, b) => a - b);

  it('Add lays the default tile on the run face from the left end; a second Add does nothing', () => {
    const { view } = withTile();
    expect(view.layout.tile).not.toBeNull();
    expect(wallTileStart(view)).toEqual({ fromLeft: 0, height: 0 });
    expect(view.layout.tile!.height).toBe(96);
    expect(cutXs(view)).toContain(109.125);
    expect(wallTileAddChanges(view, ids())).toEqual([]);
  });

  it('AC-EZD-733-1: typing a start 6" from the left moves the cuts', () => {
    const { objects, view } = withTile();
    const changes = wallTileChanges(view, modelObjects(objects), { startFromLeft: 6 });
    expect(changes).toHaveLength(1);
    objects.set(changes[0]!.id, changes[0]!.value!);
    const moved = cabinetView(modelObjects(objects), CAB_FLOOR)!;
    expect(wallTileStart(moved)).toEqual({ fromLeft: 6, height: 0 });
    expect(cutXs(moved)).toContain(0);
    const first = moved.layout.tile!.pieces.find(
      (p) => p.cut && Math.min(...p.points.map((q) => q.x)) === 0,
    )!;
    expect(Math.max(...first.points.map((q) => q.x))).toBeCloseTo(5.875, 9);
    expect(cutXs(moved)).not.toContain(109.125);
  });

  it('pattern, size and joint edits; a zero size or negative joint is refused; no change is no edit', () => {
    const { objects, view } = withTile();
    const parsed = modelObjects(objects);
    const [c] = wallTileChanges(view, parsed, {
      pattern: 'herringbone',
      tileWidth: 3,
      tileHeight: 6,
      joint: 0,
    });
    expect((c!.value!.data as { attributes: unknown }).attributes).toEqual({
      pattern: 'herringbone',
      tileWidth: 3,
      tileHeight: 6,
      joint: 0,
    });
    expect(wallTileChanges(view, parsed, { tileWidth: 0 })).toEqual([]);
    expect(wallTileChanges(view, parsed, { joint: -0.125 })).toEqual([]);
    expect(wallTileChanges(view, parsed, { height: 0 })).toEqual([]);
    expect(wallTileChanges(view, parsed, { pattern: 'straight' })).toEqual([]);
  });
});
