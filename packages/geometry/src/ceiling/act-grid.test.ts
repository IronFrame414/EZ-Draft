// EZD-511 ACT grid balancing (AC-EZD-511-1 "Acceptance: ACT borders are never below half a tile."; S05 Validation "edge
// tiles at least half a tile (12" on a 2x2 module; 12" or 24" on 2x4 per direction)"; 12 Acceptance RCP "ACT grid
// borders never below half tile"). Expected numbers are the worked examples of vault/build/assumptions.md EZD-511
// "Balancing per direction" (94" -> 23", 114" -> 21", 120" -> whole tiles, 114" at 1/4 -> 9") and hand working from
// the same rule; none come from running the code. The board's 11" and 9 1/2" are placeholders and are not used.
import { describe, expect, it } from 'vitest';
import type { ActGridData, RoomData } from '../schema';
import {
  actBorderSizes,
  actBorderWarnings,
  actGridLayout,
  actGridSegments,
  actMinBorderShare,
  actTileAt,
  balanceActDirection,
  balancedActStart,
} from './act-grid';

const ROOM_ID = '6a5bae36-e7f4-4459-a3b8-b1528fbd8a21';
const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';

function room(w: number, h: number): RoomData {
  return {
    geometry: {
      boundary: [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ],
    },
    level: LEVEL,
    attributes: { ceilingType: null, ceiling: null },
  } as unknown as RoomData;
}

function grid(over: Partial<ActGridData['attributes']> = {}, start = { x: 0, y: 0 }): ActGridData {
  return {
    geometry: { roomId: ROOM_ID, start },
    status: 'new',
    level: LEVEL,
    attributes: { module: '2x2', direction: 'with_long_wall', balanced: true, ...over },
  };
}

describe('EZD-511 balancing one direction', () => {
  it('worked examples on a 24" tile at half a tile (12")', () => {
    // 94: n = 3, r = 22, 11 < 12, so (22 + 24) / 2 = 23 and one whole tile is given up.
    expect(balanceActDirection(94, 24, 12)).toEqual({ first: 23, last: 23, whole: 2 });
    // 114: n = 4, r = 18, 9 < 12, so (18 + 24) / 2 = 21.
    expect(balanceActDirection(114, 24, 12)).toEqual({ first: 21, last: 21, whole: 3 });
    // 120: r = 0, whole tiles to both walls.
    expect(balanceActDirection(120, 24, 12)).toEqual({ first: 24, last: 24, whole: 3 });
  });

  it('at a quarter tile (6") 114" gives 9" borders; at a third (8") also 9"', () => {
    expect(balanceActDirection(114, 24, 6)).toEqual({ first: 9, last: 9, whole: 4 });
    expect(balanceActDirection(114, 24, 8)).toEqual({ first: 9, last: 9, whole: 4 });
  });

  it('the 48" direction of a 2x4 grid: 120" gives 36" borders (24 / 2 = 12 is under 24)', () => {
    expect(balanceActDirection(120, 48, 24)).toEqual({ first: 36, last: 36, whole: 1 });
  });

  it('a direction shorter than one tile is one cut piece wall to wall', () => {
    expect(balanceActDirection(40, 48, 24)).toEqual({ first: 40, last: 40, whole: 0 });
    expect(balanceActDirection(24, 24, 12)).toEqual({ first: 24, last: 24, whole: 0 });
  });

  it('AC-EZD-511-1 borders are never below half a tile: 24" to 240" in 1/2" steps on both tile sizes', () => {
    for (const tile of [24, 48]) {
      const min = tile / 2;
      for (let L = 24; L <= 240; L += 0.5) {
        const b = balanceActDirection(L, tile, min);
        // One piece wall to wall (L <= tile), or two borders and whole tiles that add up to the room.
        const onePiece = L <= tile;
        if (onePiece) expect(b).toEqual({ first: L, last: L, whole: 0 });
        else expect(b.first + b.last + b.whole * tile).toBe(L);
        expect(Math.min(b.first, b.last)).toBeGreaterThanOrEqual(min);
        expect(Math.max(b.first, b.last)).toBeLessThanOrEqual(onePiece ? L : tile);
      }
    }
  });
});

describe('EZD-511 laying a grid out on its room', () => {
  it('reads the Defaults choice as a share of the tile; anything else is half', () => {
    expect(actMinBorderShare('1/4')).toBe(0.25);
    expect(actMinBorderShare('1/3')).toBeCloseTo(1 / 3, 12);
    expect(actMinBorderShare('1/2')).toBe(0.5);
    expect(actMinBorderShare(null)).toBe(0.5);
  });

  it('a 120" x 96" room, 2x2 with the long wall: whole tiles both ways, start at (24, 24)', () => {
    const layout = actGridLayout(grid(), room(120, 96), 0.5);
    expect(layout.alongMain.dir).toEqual({ x: 1, y: 0 });
    expect(layout.alongMain.lines).toEqual([24, 48, 72, 96]);
    expect(layout.acrossMains.lines).toEqual([24, 48, 72]);
    expect(layout.start).toEqual({ x: 24, y: 24 });
    expect(actBorderSizes(layout)).toEqual([24, 24]);
    expect(actGridSegments(layout)).toHaveLength(7);
  });

  it('2x4: the mains are 48" apart, the cross tees 24"', () => {
    const layout = actGridLayout(grid({ module: '2x4' }), room(120, 96), 0.5);
    expect(layout.alongMain.lines).toEqual([24, 48, 72, 96]);
    expect(layout.acrossMains.lines).toEqual([48]);
  });

  it('AC-EZD-511-1 a 94" x 114" room balances to 21" along the 114" wall and 23" across it', () => {
    const layout = actGridLayout(grid(), room(94, 114), 0.5);
    // The longest wall runs along y, so the mains do.
    expect(Math.abs(layout.alongMain.dir.y)).toBe(1);
    expect(layout.alongMain.borders).toEqual([21, 21]);
    expect(layout.acrossMains.borders.map((b) => Math.round(b * 16) / 16)).toEqual([23, 23]);
    expect(actBorderSizes(layout).map((b) => Math.round(b * 16) / 16)).toEqual([21, 23]);
  });

  it('Across long wall swaps the directions', () => {
    const layout = actGridLayout(grid({ direction: 'across_long_wall' }), room(120, 96), 0.5);
    expect(Math.abs(layout.alongMain.dir.y)).toBe(1);
    expect(Math.abs(layout.acrossMains.dir.x)).toBe(1);
  });

  it('a balanced grid ignores its stored start and never warns', () => {
    const g = grid({}, { x: 6, y: 6 });
    const layout = actGridLayout(g, room(120, 96), 0.5);
    expect(layout.start).toEqual({ x: 24, y: 24 });
    expect(actBorderWarnings(g, layout)).toEqual([]);
    expect(balancedActStart(g, room(94, 114), 0.5)).toBeDefined();
  });

  it('an override start under the minimum warns; one that meets it does not', () => {
    // Start x = 6: lines at 6, 30, 54, 78, 102, so the borders along the main are 6" and 18"; 6" < 12".
    const g = grid({ balanced: false }, { x: 6, y: 24 });
    const layout = actGridLayout(g, room(120, 96), 0.5);
    expect(layout.alongMain.lines).toEqual([6, 30, 54, 78, 102]);
    expect(layout.alongMain.borders).toEqual([6, 18]);
    expect(actBorderWarnings(g, layout)).toEqual([{ direction: 'along_main', border: 6, min: 12 }]);
    // Start x = 12: borders 12" and 12", at the minimum, so no warning.
    const ok = grid({ balanced: false }, { x: 12, y: 24 });
    expect(actBorderWarnings(ok, actGridLayout(ok, room(120, 96), 0.5))).toEqual([]);
    // At a quarter tile (6"), the 6" border meets the minimum.
    expect(actBorderWarnings(g, actGridLayout(g, room(120, 96), 0.25))).toEqual([]);
  });

  it('a troffer snaps to the whole tile under it, or the nearest whole tile from a cut border', () => {
    // 100" x 60": along x (100) borders 14", lines 14, 38, 62, 86; along y (60) borders 18", lines 18, 42.
    const layout = actGridLayout(grid(), room(100, 60), 0.5);
    expect(layout.alongMain.lines).toEqual([14, 38, 62, 86]);
    expect(layout.acrossMains.lines).toEqual([18, 42]);
    expect(actTileAt(layout, { x: 50, y: 30 })?.center).toEqual({ x: 50, y: 30 });
    expect(actTileAt(layout, { x: 5, y: 5 })?.center).toEqual({ x: 26, y: 30 });
  });
});
