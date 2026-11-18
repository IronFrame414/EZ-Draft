// EZD-404 (AC-EZD-404-2 "The elevation's chain widths sum to the run total"; S04 Layout). Expected values are hand
// figures from board S04: the back wall run is a 3" filler, B15, DW24, SB36, B18 and B21, chain 3 + 15 + 24 + 36 + 18 +
// 21 = 117"; 34 1/2" base boxes (S04 Height) under the board's 36" countertop top, an 18" gap and 30" uppers, on a
// 117 1/2" wall (AC-EZD-407-1).
import { describe, expect, it } from 'vitest';
import type { CabinetBoxType, CabinetFaceLayout, ModelObject } from '../schema';
import {
  CABINET_DEFAULT_TOE_KICK,
  cabinetElevationLetter,
  cabinetFaces,
  cabinetRunLayout,
} from './elevation';
import { cabinetRunTotal, objectLookup, type CabinetRun } from './run';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
let n = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const box = (
  code: string,
  width: number,
  boxType: CabinetBoxType = 'base',
  faceLayout: CabinetFaceLayout = 'door_1',
  height = boxType === 'wall' ? 30 : boxType === 'tall' ? 84 : 34.5,
): ModelObject => ({
  id: nextId(),
  type: 'cabinet_box',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: {
      code,
      boxType,
      width,
      depth: boxType === 'wall' ? 12 : 24,
      height,
      faceLayout,
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  },
});
const filler = (width: number, scribe: number, height = 34.5): ModelObject => ({
  id: nextId(),
  type: 'cabinet_filler',
  data: {
    status: 'new',
    level: LEVEL,
    attributes: { code: `F${width}`, width, depth: 24, height, scribe, catalogItemId: null, finish: null },
  },
});
const wall = (x0: number, x1: number): ModelObject => ({
  id: nextId(),
  type: 'wall',
  data: {
    geometry: { start: { x: x0, y: 0 }, end: { x: x1, y: 0 } },
    status: 'new',
    level: LEVEL,
    attributes: {
      thickness: 4.5,
      thicknessSide: 'right',
      height: 96,
      topCutToCeiling: false,
      bearing: false,
      layers: [
        { material: 'drywall', thickness: 0.5 },
        { material: 'stud', thickness: 3.5 },
        { material: 'drywall', thickness: 0.5 },
      ],
    },
  },
});
const run = (
  base: ModelObject[],
  upper: ModelObject[] = [],
  o: { hostWallId?: string | null; start?: { x: number; y: number }; extra?: string[] } = {},
): CabinetRun => ({
  id: nextId(),
  type: 'cabinet_run',
  data: {
    geometry: { hostWallId: o.hostWallId ?? null, start: o.start ?? { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
    level: LEVEL,
    attributes: {
      name: 'Back wall run',
      base: [...base.map((b) => b.id), ...(o.extra ?? [])],
      upper: upper.map((b) => b.id),
    },
  },
});

const boardBase = () => [
  filler(3, 0.5),
  box('B15', 15, 'base', 'drawer_door_1'),
  box('DW24', 24, 'appliance_panel', 'panel'),
  box('SB36', 36, 'sink_base', 'false_drawer_doors_2'),
  box('B18', 18, 'base', 'drawer_door_1'),
  box('B21', 21, 'base', 'drawer_door_1'),
];

describe('EZD-404 cabinet run layout', () => {
  it('AC-EZD-404-2: the board run chain is 3, 15, 24, 36, 18, 21 and sums to the 117" run total', () => {
    const base = boardBase();
    const r = run(base);
    const objects = [r, ...base];
    const layout = cabinetRunLayout(r, objects);
    expect(layout.chain.map((c) => c.width)).toEqual([3, 15, 24, 36, 18, 21]);
    expect(layout.chain.map((c) => c.x)).toEqual([0, 3, 18, 42, 78, 96]);
    const sum = layout.chain.reduce((s, c) => s + c.width, 0);
    expect(sum).toBe(117);
    expect(layout.total).toBe(117);
    expect(sum).toBe(cabinetRunTotal(r, objectLookup(objects)));
    expect(layout.chain.map((c) => c.id)).toEqual(base.map((b) => b.id));
  });

  it('uppers and an id missing from the model do not change the chain', () => {
    const base = boardBase();
    const upper = [box('W1530', 15, 'wall', 'door_1'), box('W2430', 24, 'wall', 'doors_2')];
    const r = run(base, upper, { extra: ['00000000-0000-4000-8000-999999999999'] });
    const layout = cabinetRunLayout(r, [r, ...base, ...upper]);
    expect(layout.chain.map((c) => c.width)).toEqual([3, 15, 24, 36, 18, 21]);
    expect(layout.chain.reduce((s, c) => s + c.width, 0)).toBe(117);
    expect(layout.upper.map((s) => [s.code, s.x, s.width])).toEqual([
      ['W1530', 0, 15],
      ['W2430', 15, 24],
    ]);
  });

  it('a custom 16 1/2" box keeps its width in the chain (Round 3, 03g never rounded)', () => {
    const base = [box('B16-1/2', 16.5), box('B18', 18)];
    const r = run(base);
    const layout = cabinetRunLayout(r, [r, ...base]);
    expect(layout.chain.map((c) => c.width)).toEqual([16.5, 18]);
    expect(layout.total).toBe(34.5);
  });

  it('heights: 36" to the countertop top, an 18" gap, 30" uppers (board S04)', () => {
    const base = boardBase();
    const upper = [box('W3030', 30, 'wall', 'doors_2')];
    const r = run(base, upper);
    const layout = cabinetRunLayout(r, [r, ...base, ...upper]);
    expect(layout.heights).toEqual([
      { kind: 'base', from: 0, to: 36 },
      { kind: 'gap', from: 36, to: 54 },
      { kind: 'upper', from: 54, to: 84 },
    ]);
    expect(layout.countertops).toEqual([{ x: 0, width: 117, bottom: 34.5, top: 36 }]);
    expect(layout.toeKick).toEqual({ x: 0, width: 117, height: CABINET_DEFAULT_TOE_KICK });
    expect(layout.upper[0]).toMatchObject({ bottom: 54, top: 84 });
    expect(layout.base[1]).toMatchObject({ bottom: CABINET_DEFAULT_TOE_KICK, top: 34.5 });
  });

  it('without uppers there is only the base height', () => {
    const base = boardBase();
    const r = run(base);
    expect(cabinetRunLayout(r, [r, ...base]).heights).toEqual([{ kind: 'base', from: 0, to: 36 }]);
  });

  it('a toe kick trim sets the toe kick height; a tall box splits the countertop', () => {
    const base = [box('B24', 24), box('T1884', 18, 'tall', 'doors_2'), box('B30', 30)];
    const r = run(base);
    const trim: ModelObject = {
      id: nextId(),
      type: 'cabinet_trim',
      data: {
        geometry: { runId: r.id, row: 'base' },
        status: 'new',
        level: LEVEL,
        attributes: { kind: 'toe_kick', height: 4.5, catalogItemId: null, finish: null },
      },
    };
    const layout = cabinetRunLayout(r, [r, ...base, trim]);
    expect(layout.toeKick?.height).toBe(4.5);
    expect(layout.countertops.map((c) => [c.x, c.width])).toEqual([
      [0, 24],
      [42, 30],
    ]);
    expect(layout.base[1]).toMatchObject({ bottom: 4.5, top: 84 });
  });

  it('plan strip: the host wall spans 0 to 117 1/2" along the run', () => {
    const w = wall(0, 117.5);
    const base = boardBase();
    const r = run(base, [], { hostWallId: w.id });
    expect(cabinetRunLayout(r, [w, r, ...base]).wall).toEqual({ from: 0, to: 117.5 });
    // A wall drawn the other way, the run starting 6" in.
    const w2 = wall(123.5, 6);
    const r2 = run(base, [], { hostWallId: w2.id, start: { x: 6, y: 0 } });
    expect(cabinetRunLayout(r2, [w2, r2, ...base]).wall).toEqual({ from: 0, to: 117.5 });
    expect(cabinetRunLayout(run(base), [...base]).wall).toBeNull();
  });

  it('faces: false drawer + 2 doors is a 6" false drawer over two half-width doors', () => {
    expect(cabinetFaces('false_drawer_doors_2', 42, 4, 36, 30.5)).toEqual([
      { kind: 'false_drawer', x: 42, y: 28.5, width: 36, height: 6 },
      { kind: 'door', x: 42, y: 4, width: 18, height: 24.5 },
      { kind: 'door', x: 60, y: 4, width: 18, height: 24.5 },
    ]);
    expect(cabinetFaces('drawers_3', 0, 0, 18, 30).map((f) => [f.kind, f.y, f.height])).toEqual([
      ['drawer', 0, 10],
      ['drawer', 10, 10],
      ['drawer', 20, 10],
    ]);
    expect(cabinetFaces('open', 0, 0, 18, 30)).toEqual([]);
  });

  it('elevation letters: A for the first hosting wall, B for the next; runs on one wall share a letter (R24)', () => {
    const w1 = wall(0, 120);
    const w2 = wall(0, 96);
    const a = run([], [], { hostWallId: w1.id });
    const b = run([], [], { hostWallId: w2.id });
    const c = run([], [], { hostWallId: w1.id });
    const objects = [w1, w2, a, b, c];
    expect(cabinetElevationLetter(a, objects)).toBe('A');
    expect(cabinetElevationLetter(b, objects)).toBe('B');
    expect(cabinetElevationLetter(c, objects)).toBe('A');
  });
});
