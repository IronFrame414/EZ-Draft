// EZD-213a - T5-T8 (vault/plans/EZD-213a.md section 4; AC-EZD-213-22, AC-EZD-213-23, AC-EZD-213-24): opening height,
// rough opening, sill, swing, hand, impact rating, shutter type and Offset left. Expected values: Q-0630 sizes and
// rows 4, 14, "Door offset"; Q-0633 G6, G11; Q-0642 row 4; P204a `autoRoughOpening` and refine (b); 09k Offset,
// Offset zero, Offset maximum; plan Decided rows of step 3. Inputs are deepFrozen; floats use toBeCloseTo(v, 9).
import { describe, expect, it } from 'vitest';
import { D2, flaggedObj, openingObj } from '../moves/test-utils/fixtures';
import { openingDataSchema, type ModelObject, type Point } from '../schema';
import { deepFreeze, ID, roomWalls } from '../walls/test-utils/fixtures';
import type { WallObject } from '../walls/wall';
import {
  setHand,
  setImpactRating,
  setOpeningHeight,
  setOpeningOffsetLeft,
  setRoughOpening,
  setShutterType,
  setSillHeight,
  setSwing,
  type OpeningEditResult,
  type SetOffsetResult,
} from './edit';
import { openingOffsets } from './offsets';
import type { OpeningObject } from './opening';

const { D1, N1 } = ID;
const P = (x: number, y: number): Point => ({ x, y });

const walls = (): WallObject[] => roomWalls(144, 120);
const w1 = (): WallObject => walls()[0]!;
const door = (): OpeningObject => deepFreeze(openingObj(D1, 'door', w1(), P(72, 0)));
const win = (): OpeningObject => deepFreeze(openingObj(N1, 'window', w1(), P(72, 0)));

const ok = (r: OpeningEditResult): OpeningObject => {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  expect(openingDataSchema.safeParse(r.opening.data).success).toBe(true);
  return deepFreeze(r.opening);
};

const expectRo = (o: OpeningObject, width: number, height: number) => {
  expect(o.data.attributes.roughOpening.width).toBeCloseTo(width, 9);
  expect(o.data.attributes.roughOpening.height).toBeCloseTo(height, 9);
};

const expectPoint = (got: Point, x: number, y: number) => {
  expect(got.x).toBeCloseTo(x, 9);
  expect(got.y).toBeCloseTo(y, 9);
};

const moved = (r: SetOffsetResult): OpeningObject => {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  expect(r.changed).toHaveLength(1);
  return r.changed[0]!;
};

describe('EZD-213a opening edits', () => {
  it('EZD-213a T5 opening height and rough opening', () => {
    const a = ok(setOpeningHeight(door(), 82));
    expect(a.data.attributes.height).toBeCloseTo(82, 9);
    expectRo(a, 38, 84.5);
    expect(a.data.attributes.roughOpeningMode).toBe('auto');

    const b = ok(setOpeningHeight(win(), 60));
    expectRo(b, 36.5, 60.5);

    const typed = ok(setRoughOpening(door(), { width: 34.5, height: 82.5 }));
    expectRo(typed, 34.5, 82.5);
    expect(typed.data.attributes.roughOpeningMode).toBe('typed');
    const taller = ok(setOpeningHeight(typed, 84));
    expect(taller.data.attributes.height).toBeCloseTo(84, 9);
    expectRo(taller, 34.5, 82.5);

    const same = ok(setRoughOpening(door(), { width: 38, height: 82.5 }));
    expect(same.data.attributes.roughOpeningMode).toBe('auto');

    expect(setOpeningHeight(door(), 0)).toEqual({ ok: false, reason: 'not_positive' });
    expect(setOpeningHeight(door(), Number.NaN)).toEqual({ ok: false, reason: 'invalid_input' });
    expect(setRoughOpening(door(), { width: 0, height: 82 })).toEqual({
      ok: false,
      reason: 'not_positive',
    });
  });

  it('EZD-213a T6 sill, swing and hand', () => {
    expect(ok(setSillHeight(win(), 0)).data.attributes.sillHeight).toBe(0);
    expect(ok(setSillHeight(win(), 24)).data.attributes.sillHeight).toBeCloseTo(24, 9);
    expect(setSillHeight(win(), -0.0625)).toEqual({ ok: false, reason: 'negative' });
    expect(setSillHeight(win(), Number.NaN)).toEqual({ ok: false, reason: 'invalid_input' });
    expect(setSillHeight(door(), 24)).toEqual({ ok: false, reason: 'not_window' });

    const swung = ok(setSwing(door(), 'right'));
    expect(swung.data.attributes.swing).toBe('right');
    expectPoint(swung.data.geometry.center, 72, 0);
    const handed = ok(setHand(door(), 'right'));
    expect(handed.data.attributes.hand).toBe('right');
    expectPoint(handed.data.geometry.center, 72, 0);

    expect(setSwing(win(), 'right')).toEqual({ ok: false, reason: 'not_door' });
    expect(setHand(win(), 'right')).toEqual({ ok: false, reason: 'not_door' });
  });

  it('EZD-213a T7 impact rating and shutter type', () => {
    const a = ok(setImpactRating(door(), 'shutter'));
    expect(a.data.attributes.impactRating).toBe('shutter');
    expect(a.data.attributes.shutterType).toBeNull();
    const b = ok(setShutterType(a, 'bahama'));
    expect(b.data.attributes.shutterType).toBe('bahama');
    const c = ok(setImpactRating(b, 'impact_rated'));
    expect(c.data.attributes.impactRating).toBe('impact_rated');
    expect(c.data.attributes.shutterType).toBeNull();
    expect(setShutterType(c, 'accordion')).toEqual({ ok: false, reason: 'not_shutter' });
  });

  it('EZD-213a T8 Offset left', () => {
    const objs = (...extra: ModelObject[]): readonly ModelObject[] =>
      deepFreeze([...walls(), ...extra]);
    const base = objs(door());

    for (const [offset, x, right] of [
      [36, 54, 72],
      [0, 18, 108],
      [108, 126, 0],
    ] as const) {
      const o = moved(setOpeningOffsetLeft(base, D1, offset));
      expect(o.id).toBe(D1);
      expectPoint(o.data.geometry.center, x, 0);
      const off = openingOffsets(o, w1(), walls());
      expect(off).not.toBeNull();
      expect(off!.left, `left at ${offset}`).toBeCloseTo(offset, 9);
      expect(off!.right, `right at ${offset}`).toBeCloseTo(right, 9);
    }

    expect(setOpeningOffsetLeft(base, D1, 108.0625)).toEqual({
      ok: false,
      reason: 'past_corner',
      id: D1,
    });
    expect(setOpeningOffsetLeft(base, D1, -1)).toEqual({
      ok: false,
      reason: 'invalid_input',
      id: D1,
    });
    expect(setOpeningOffsetLeft(base, D1, Number.NaN)).toEqual({
      ok: false,
      reason: 'invalid_input',
      id: D1,
    });

    const two = objs(door(), openingObj(D2, 'door', w1(), P(110, 0)));
    expect(setOpeningOffsetLeft(two, D1, 60)).toEqual({ ok: false, reason: 'overlap', id: D1 });

    const flagged = objs(flaggedObj(door(), P(1, 0)));
    expect(setOpeningOffsetLeft(flagged, D1, 36)).toEqual({
      ok: false,
      reason: 'not_on_wall',
      id: D1,
    });

    expect(setOpeningOffsetLeft(base, ID.Z, 36)).toEqual({
      ok: false,
      reason: 'not_found',
      id: ID.Z,
    });
  });
});
