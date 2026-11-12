// EZD-213a - T1-T4 (vault/plans/EZD-213a.md section 4; AC-EZD-213-14, AC-EZD-213-23): typed thickness, layer rows,
// height and bearing of one wall. Expected values: Q-0630 rows 13, 14; 09k Thickness; Q-0658 (a); Q-0640 row 5-4;
// Q-0635; Q-0570; 03f; plan Decided "setWallThickness", "setWallLayer", "setWallHeight, setWallBearing". Inputs are
// deepFrozen; floats compare with toBeCloseTo(v, 9).
import { describe, expect, it } from 'vitest';
import { wallDataSchema, type WallLayer } from '../schema';
import {
  setWallBearing,
  setWallHeight,
  setWallLayer,
  setWallThickness,
  type WallEditResult,
} from './edit';
import { deepFreeze, ID, roomWalls } from './test-utils/fixtures';
import type { WallObject } from './wall';

const w1 = (): WallObject => deepFreeze(roomWalls(144, 120)[0]!);

const withLayers = (layers: WallLayer[], thickness: number): WallObject => {
  const base = roomWalls(144, 120)[0]!;
  return deepFreeze({
    ...base,
    data: { ...base.data, attributes: { ...base.data.attributes, layers, thickness } },
  });
};

const twoStud = (): WallObject =>
  withLayers(
    [
      { material: 'stud', thickness: 3.5 },
      { material: 'drywall', thickness: 0.5 },
      { material: 'stud', thickness: 3.5 },
    ],
    7.5,
  );

const okWall = (r: WallEditResult): WallObject => {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  expect(wallDataSchema.safeParse(r.wall.data).success).toBe(true);
  return r.wall;
};

const rows = (w: WallObject): number[] => w.data.attributes.layers.map((l) => l.thickness);

describe('EZD-213a wall edits', () => {
  it('EZD-213a T1 typed thickness changes the stud', () => {
    for (const [t, stud] of [
      [6.5, 5.5],
      [3.5, 2.5],
      [1.0625, 0.0625],
      [4.5, 3.5],
    ] as const) {
      const w = okWall(setWallThickness(w1(), t));
      expect(w.id).toBe(ID.W1);
      const r = rows(w);
      expect(r).toHaveLength(3);
      expect(r[0], `row 0 at ${t}`).toBeCloseTo(0.5, 9);
      expect(r[1], `stud at ${t}`).toBeCloseTo(stud, 9);
      expect(r[2], `row 2 at ${t}`).toBeCloseTo(0.5, 9);
      expect(w.data.attributes.layers.map((l) => l.material)).toEqual([
        'drywall',
        'stud',
        'drywall',
      ]);
      expect(w.data.attributes.thickness).toBeCloseTo(t, 9);
    }
    expect(setWallThickness(w1(), 1)).toEqual({ ok: false, reason: 'stud_not_positive' });
    expect(setWallThickness(w1(), 0)).toEqual({ ok: false, reason: 'not_positive' });
    expect(setWallThickness(w1(), -1)).toEqual({ ok: false, reason: 'not_positive' });
    expect(setWallThickness(w1(), Number.NaN)).toEqual({ ok: false, reason: 'invalid_input' });
    expect(setWallThickness(w1(), Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      reason: 'invalid_input',
    });
  });

  it('EZD-213a T2 no stud and two studs', () => {
    const noStud = withLayers(
      [
        { material: 'drywall', thickness: 0.5 },
        { material: 'drywall', thickness: 0.5 },
      ],
      1,
    );
    expect(setWallThickness(noStud, 6.5)).toEqual({ ok: false, reason: 'no_stud' });

    const w = okWall(setWallThickness(twoStud(), 9.5));
    const r = rows(w);
    expect(r).toHaveLength(3);
    expect(r[0]).toBeCloseTo(5.5, 9);
    expect(r[1]).toBeCloseTo(0.5, 9);
    expect(r[2]).toBeCloseTo(3.5, 9);
    expect(w.data.attributes.thickness).toBeCloseTo(9.5, 9);
  });

  it('EZD-213a T3 layer rows', () => {
    const a = okWall(setWallLayer(w1(), 0, { material: 'drywall', thickness: 0.625 }));
    expect(a.data.attributes.thickness).toBeCloseTo(4.625, 9);
    expect(rows(a)).toHaveLength(3);

    expect(setWallLayer(w1(), 1, { material: 'stud', thickness: 0 })).toEqual({
      ok: false,
      reason: 'not_positive',
    });
    expect(setWallLayer(w1(), 1, { material: 'drywall', thickness: 3.5 })).toEqual({
      ok: false,
      reason: 'only_stud',
    });

    const b = okWall(setWallLayer(w1(), 0, { material: 'tile_backer', thickness: 0.5 }));
    expect(b.data.attributes.thickness).toBeCloseTo(4.5, 9);
    expect(b.data.attributes.layers[0]!.material).toBe('tile_backer');

    const drywall = { material: 'drywall', thickness: 0.5 } as const;
    expect(setWallLayer(w1(), 3, drywall)).toEqual({ ok: false, reason: 'invalid_input' });
    expect(setWallLayer(w1(), -1, drywall)).toEqual({ ok: false, reason: 'invalid_input' });
    expect(setWallLayer(w1(), 0.5, drywall)).toEqual({ ok: false, reason: 'invalid_input' });
    expect(setWallLayer(w1(), 0, { material: 'drywall', thickness: Number.NaN })).toEqual({
      ok: false,
      reason: 'invalid_input',
    });

    const c = okWall(setWallLayer(twoStud(), 0, { material: 'drywall', thickness: 3.5 }));
    expect(c.data.attributes.thickness).toBeCloseTo(7.5, 9);
  });

  it('EZD-213a T4 height and bearing', () => {
    expect(okWall(setWallHeight(w1(), 108)).data.attributes.height).toBeCloseTo(108, 9);
    expect(okWall(setWallHeight(w1(), 2400.0625)).data.attributes.height).toBeCloseTo(2400.0625, 9);
    expect(setWallHeight(w1(), 0)).toEqual({ ok: false, reason: 'not_positive' });
    expect(setWallHeight(w1(), Number.NaN)).toEqual({ ok: false, reason: 'invalid_input' });

    const on = okWall(setWallBearing(w1(), true));
    expect(on.data.attributes.bearing).toBe(true);
    const off = okWall(setWallBearing(deepFreeze(on), false));
    expect(off.data.attributes.bearing).toBe(false);
  });
});
