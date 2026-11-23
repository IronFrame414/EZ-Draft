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
  cabinetFitFillerIds,
  cabinetViewFit,
  cabinetInsertIndex,
  cabinetLibraryInsertChanges,
  cabinetLibraryWidthChanges,
  cabinetRuns,
  cabinetTrimChanges,
} from './cabinet-view';
import { libraryRow, libraryTrim } from './cabinet-library';
import type { Change, Objects } from '../model/patches';
import {
  boardModel,
  boardModelWallMoved,
  CAB_FLOOR,
  CAB_RUN,
  CAB_WALL,
  cabId,
} from './test-utils/board-run';

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

// EZD-407 (AC-EZD-407-1 "A 117" run with 1/2" scribe on a 117 1/2" wall shows green"; phase-04 EZD-407 rule). The
// board run is 117" with one 3" filler carrying 1/2" scribe, on a 117 1/2" wall.
// The board model with its back wall `length` long.
const wallOf = (length: number) => {
  const m = new Map(boardModel());
  const w = m.get(CAB_WALL)!;
  const data = w.data as { geometry: { start: { x: number; y: number } } };
  m.set(CAB_WALL, {
    ...w,
    data: { ...w.data, geometry: { ...data.geometry, end: { x: length, y: 0 } } },
  });
  return m;
};

describe('EZD-407 fit of the run', () => {
  it('AC-EZD-407-1: the board run fits its 117 1/2" wall with 1/2" scribe and no tolerance set', () => {
    const v = cabinetView(modelObjects(boardModel()), CAB_FLOOR)!;
    const f = cabinetViewFit(v, null);
    expect(f).toMatchObject({ fits: true, total: 117, wallLength: 117.5, scribe: 0.5, gap: 0.5 });
  });

  it('a 120" wall: the 3" gap is more than the 1/2" scribe, flagged; a 2 1/2" tolerance makes it fit', () => {
    const v = cabinetView(modelObjects(wallOf(120)), CAB_FLOOR)!;
    expect(cabinetViewFit(v, null)).toMatchObject({ fits: false, gap: 3 });
    expect(cabinetViewFit(v, 2.5)).toMatchObject({ fits: true, gap: 3 });
  });

  it('a 115" wall: the run is 2" longer than the wall, flagged', () => {
    const v = cabinetView(modelObjects(wallOf(115)), CAB_FLOOR)!;
    expect(cabinetViewFit(v, null)).toMatchObject({ fits: false, gap: -2 });
  });

  it('the chip click picks the base row fillers', () => {
    const v = cabinetView(modelObjects(boardModel()), CAB_FLOOR)!;
    expect(cabinetFitFillerIds(v)).toEqual([cabId(1)]);
  });

  it('a run off every wall has no fit', () => {
    const v = cabinetView(modelObjects(boardModel()), CAB_FLOOR)!;
    expect(cabinetViewFit({ ...v, layout: { ...v.layout, wall: null } }, null)).toBeNull();
  });
});

// EZD-403 (AC-EZD-403-1 "Dragging a B24 row into a run inserts a box at the drop position"; S04 "drop position sets
// order in the run"; "Tab: Runs | ... click to open that run"). Board run: F3 0–3, B15 3–18, DW24 18–42, SB36 42–78,
// B18 78–96, B21 96–117. A drop at 45" is right of DW24's middle (30") and left of SB36's (60").
describe('EZD-403 library drop', () => {
  const apply = (objects: Objects, changes: readonly Change[]): Objects => {
    const next = new Map(objects);
    for (const c of changes) {
      if (c.value === null) next.delete(c.id);
      else next.set(c.id, c.value);
    }
    return next;
  };
  const NEW = 'c0000000-0000-4000-8000-000000000900';

  it('AC-EZD-403-1: a B24 dropped at 45" stands between DW24 and SB36 as one edit', () => {
    const parsed = modelObjects(boardModel());
    const v = cabinetView(parsed, CAB_FLOOR);
    if (v === null) throw new Error('no run');
    const b24 = libraryRow('b1');
    if (b24 === null) throw new Error('no row');
    expect(cabinetInsertIndex(v, 'base', 45)).toBe(3);
    const changes = cabinetLibraryInsertChanges(v, b24, 24, 45, NEW, null);
    const after = cabinetView(modelObjects(apply(boardModel(), changes)), CAB_FLOOR);
    expect(after?.run.data.attributes.base).toEqual([
      cabId(1),
      cabId(2),
      cabId(3),
      NEW,
      cabId(4),
      cabId(5),
      cabId(6),
    ]);
    expect(after?.layout.chain.map((c) => c.width)).toEqual([3, 15, 24, 24, 36, 18, 21]);
    expect(after?.layout.total).toBe(141);
    expect(after?.summary.boxCount).toBe(6);
    const slot = after?.layout.base.find((s) => s.id === NEW);
    expect(slot).toMatchObject({ x: 42, width: 24, code: 'B24' });
  });

  it('a drop left of everything stands first; right of everything stands last', () => {
    const v = cabinetView(modelObjects(boardModel()), CAB_FLOOR);
    if (v === null) throw new Error('no run');
    expect(cabinetInsertIndex(v, 'base', -5)).toBe(0);
    expect(cabinetInsertIndex(v, 'base', 200)).toBe(6);
    expect(cabinetInsertIndex(v, 'upper', 200)).toBe(2);
  });

  it('a wall box goes in the upper row', () => {
    const v = cabinetView(modelObjects(boardModel()), CAB_FLOOR);
    const w = libraryRow('w');
    if (v === null || w === null) throw new Error('setup');
    const changes = cabinetLibraryInsertChanges(v, w, 12, 0, NEW, null);
    const after = cabinetView(modelObjects(apply(boardModel(), changes)), CAB_FLOOR);
    expect(after?.run.data.attributes.upper[0]).toBe(NEW);
    expect(after?.run.data.attributes.base).toHaveLength(6);
  });

  it('crown is added once along the upper row', () => {
    const parsed = modelObjects(boardModel());
    const v = cabinetView(parsed, CAB_FLOOR);
    const cm = libraryTrim('crown');
    if (v === null || cm === null) throw new Error('setup');
    const changes = cabinetTrimChanges(v, parsed, cm, NEW);
    expect(changes).toHaveLength(1);
    const after = modelObjects(apply(boardModel(), changes));
    const trim = after.find((o) => o.id === NEW);
    expect(trim?.type).toBe('cabinet_trim');
    expect(cabinetTrimChanges(v, after, cm, 'c0000000-0000-4000-8000-000000000901')).toEqual([]);
  });

  it('opens the run the Runs tab picks; an unknown id opens the first', () => {
    const second = 'c0000000-0000-4000-8000-000000000002';
    const model = new Map(boardModel());
    const run = model.get(CAB_RUN)!;
    const data = run.data as { attributes: Record<string, unknown> };
    model.set(second, {
      ...run,
      data: { ...run.data, attributes: { ...data.attributes, name: 'Island run', base: [], upper: [] } },
    });
    const parsed = modelObjects(model);
    expect(cabinetRuns(parsed, CAB_FLOOR).map((r) => r.data.attributes.name)).toEqual([
      'Back wall run',
      'Island run',
    ]);
    expect(cabinetView(parsed, CAB_FLOOR, second)?.run.id).toBe(second);
    expect(cabinetView(parsed, CAB_FLOOR, 'c0000000-0000-4000-8000-000000000003')?.run.id).toBe(CAB_RUN);
  });
});

describe('EZD-403 width typed after a drop', () => {
  it('B18 typed to 21" becomes B21 with the line item for 21"; the same width and item is no change', () => {
    const parsed = modelObjects(boardModel());
    const v = cabinetView(parsed, CAB_FLOOR);
    if (v === null) throw new Error('no run');
    const ITEM = 'c0000000-0000-4000-8000-000000000777';
    const [c] = cabinetLibraryWidthChanges(v, parsed, cabId(5), 21, ITEM);
    const a = (c?.value?.data as { attributes: Record<string, unknown> }).attributes;
    expect(a).toMatchObject({ code: 'B21', width: 21, catalogItemId: ITEM });
    expect(cabinetLibraryWidthChanges(v, parsed, cabId(5), 18, null)).toEqual([]);
  });
});
