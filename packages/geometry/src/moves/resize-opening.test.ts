// EZD-212a · O1, O2 (vault/plans/EZD-212a.md section 4; AC-EZD-212-21): resizing a door or window from a jamb.
// Expected values: 09k Door resize; Q-0630 rows 1, 14; Q-0657 (b) (a flagged opening resizes along its axis); P204a
// `autoRoughOpening`, Hand meaning, `leftEndIsLow`; plan Decided "`resizeOpening`".
import { describe, expect, it } from 'vitest';
import { openingOffsets } from '../openings/offsets';
import type { OpeningObject } from '../openings/opening';
import { uid } from '../rooms/test-utils/fixtures';
import type { ModelObject, Point } from '../schema';
import type { WallObject } from '../walls/wall';
import { deepFreeze, ID, roomWalls } from '../walls/test-utils/fixtures';
import { resizeOpening, type ResizeOpeningResult } from './resize-opening';
import { D2, flaggedObj, openingObj } from './test-utils/fixtures';

const { W1, D1 } = ID;
const P = (x: number, y: number): Point => ({ x, y });

const room = () => roomWalls(144, 120);
const wallOf = (objs: readonly ModelObject[], id: string): WallObject => {
  const w = objs.find((o) => o.id === id && o.type === 'wall');
  if (!w) throw new Error(`no wall ${id}`);
  return w as WallObject;
};
const doorOnW1 = (x: number) => openingObj(D1, 'door', wallOf(room(), W1), P(x, 0));
const one = (r: ResizeOpeningResult): OpeningObject => {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  expect(r.changed).toHaveLength(1);
  return r.changed[0]!;
};
const expectPoint = (got: Point, x: number, y: number, label: string) => {
  expect(got.x, `${label}.x`).toBeCloseTo(x, 9);
  expect(got.y, `${label}.y`).toBeCloseTo(y, 9);
};

describe('EZD-212a resizeOpening', () => {
  it('EZD-212a done when: a door resized from 36 to 32 at offset 36 leaves 76', () => {
    const walls = room();
    const objs: ModelObject[] = deepFreeze([...walls, doorOnW1(54)]);
    const door = one(resizeOpening(objs, D1, 32, 'left'));
    expectPoint(door.data.geometry.center, 52, 0, 'centre');
    expect(door.data.attributes.width).toBe(32);
    const offsets = openingOffsets(door, wallOf(walls, W1), walls);
    expect(offsets).not.toBeNull();
    expect(offsets?.left).toBeCloseTo(36, 9);
    expect(offsets?.right).toBeCloseTo(76, 9);
    expect(door.data.attributes.roughOpening).toEqual({ width: 34, height: 82.5 });

    expect(resizeOpening(objs, D1, 109, 'left')).toEqual({
      ok: false,
      reason: 'past_corner',
      id: D1,
    });
    expect(resizeOpening(objs, D1, 0, 'left')).toEqual({
      ok: false,
      reason: 'invalid_input',
      id: D1,
    });
    expect(resizeOpening(objs, D1, NaN, 'left')).toEqual({
      ok: false,
      reason: 'invalid_input',
      id: D1,
    });

    const auto = doorOnW1(54);
    const typedDoor: OpeningObject = {
      ...auto,
      data: { ...auto.data, attributes: { ...auto.data.attributes, roughOpeningMode: 'typed' } },
    };
    const typed: ModelObject[] = deepFreeze([...room(), typedDoor]);
    expect(one(resizeOpening(typed, D1, 32, 'left')).data.attributes.roughOpening).toEqual({
      width: 38,
      height: 82.5,
    });
  });

  it('EZD-212a resizeOpening keeps the right jamb, overlap and off-wall', () => {
    const walls = room();
    const objs: ModelObject[] = deepFreeze([...walls, doorOnW1(54)]);
    const right = one(resizeOpening(objs, D1, 32, 'right'));
    expectPoint(right.data.geometry.center, 56, 0, 'right jamb kept');
    expect(openingOffsets(right, wallOf(walls, W1), walls)?.left).toBeCloseTo(40, 9);

    const two: ModelObject[] = deepFreeze([
      ...room(),
      doorOnW1(54),
      openingObj(D2, 'door', wallOf(room(), W1), P(110, 0)),
    ]);
    expect(resizeOpening(two, D1, 60, 'left')).toEqual({ ok: false, reason: 'overlap', id: D1 });

    const flatX: ModelObject[] = deepFreeze([...room(), flaggedObj(doorOnW1(54), P(1, 0))]);
    const fl = one(resizeOpening(flatX, D1, 32, 'left'));
    expectPoint(fl.data.geometry.center, 52, 0, 'flagged left');
    expect(fl.data.attributes.width).toBe(32);
    expect(fl.data.geometry.hostWallId).toBeNull();
    expect(fl.data.geometry.axis).toEqual({ x: 1, y: 0 });
    expectPoint(
      one(resizeOpening(flatX, D1, 32, 'right')).data.geometry.center,
      56,
      0,
      'flagged right',
    );

    const flatY: ModelObject[] = deepFreeze([...room(), flaggedObj(doorOnW1(54), P(0, 1))]);
    expectPoint(
      one(resizeOpening(flatY, D1, 32, 'left')).data.geometry.center,
      54,
      2,
      'flagged vertical',
    );

    const noHost: ModelObject[] = deepFreeze([...room().filter((w) => w.id !== W1), doorOnW1(54)]);
    expect(resizeOpening(noHost, D1, 32, 'left')).toEqual({
      ok: false,
      reason: 'not_on_wall',
      id: D1,
    });
    expect(resizeOpening(objs, uid(0xff), 32, 'left')).toEqual({
      ok: false,
      reason: 'not_found',
      id: uid(0xff),
    });
  });
});
