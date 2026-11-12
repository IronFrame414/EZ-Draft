// EZD-212a · R1 to R4 (vault/plans/EZD-212a.md section 4; AC-EZD-212-9, -17): resizing a wall from either end and
// the drag length. Expected values: 09k Typed length; 09j Typed lengths rows 13, 15, 16; Q-0568; Q-0570; Q-0630
// row 12; Q-0598 (b) (`moveWall` join rule); plan Decided "`endDragLength`", "`resizeWall`", "Start-handle openings".
import { describe, expect, it } from 'vitest';
import { parseLength } from '../length';
import { openingOffsets } from '../openings/offsets';
import type { OpeningObject } from '../openings/opening';
import { roomAreaSqFt } from '../rooms/area';
import { findRoomOutlines } from '../rooms/outlines';
import { applyChanged, uid } from '../rooms/test-utils/fixtures';
import type { ModelObject, Point } from '../schema';
import { wallLength, type WallObject } from '../walls/wall';
import {
  deepFreeze,
  ID,
  LEVEL_1,
  partition,
  roomWalls,
  wallObj,
} from '../walls/test-utils/fixtures';
import { endDragLength, resizeWall, type ResizeWallResult } from './resize-wall';
import { openingObj } from './test-utils/fixtures';

const { W1, W2, W3, W4, P: PID, X, N1 } = ID;
const P = (x: number, y: number): Point => ({ x, y });

const room = () => roomWalls(144, 120);
const wallOf = (objs: readonly ModelObject[], id: string): WallObject => {
  const w = objs.find((o) => o.id === id && o.type === 'wall');
  if (!w) throw new Error(`no wall ${id}`);
  return w as WallObject;
};
const openingOf = (objs: readonly ModelObject[], id: string): OpeningObject => {
  const o = objs.find((x) => x.id === id && x.type === 'opening');
  if (!o) throw new Error(`no opening ${id}`);
  return o as OpeningObject;
};
const wallsOf = (objs: readonly ModelObject[]) =>
  objs.filter((o): o is WallObject => o.type === 'wall');
const changedOf = (r: ResizeWallResult): ModelObject[] => {
  expect(r.ok).toBe(true);
  return r.ok ? r.changed : [];
};
const ids = (objs: readonly { id: string }[]) => objs.map((o) => o.id);
const areas = (objs: readonly ModelObject[]) =>
  findRoomOutlines(wallsOf(objs), LEVEL_1)
    .map((o) => roomAreaSqFt(o.boundary))
    .sort((a, b) => a - b);
const expectLine = (w: WallObject, sx: number, sy: number, ex: number, ey: number) => {
  const g = w.data.geometry;
  expect(g.start.x, `${w.id} start.x`).toBeCloseTo(sx, 9);
  expect(g.start.y, `${w.id} start.y`).toBeCloseTo(sy, 9);
  expect(g.end.x, `${w.id} end.x`).toBeCloseTo(ex, 9);
  expect(g.end.y, `${w.id} end.y`).toBeCloseTo(ey, 9);
};
const lenOf = (objs: readonly ModelObject[], id: string) =>
  wallLength(wallOf(objs, id).data.geometry);
const withWindow = (): ModelObject[] => {
  const walls = room();
  return deepFreeze([...walls, openingObj(N1, 'window', wallOf(walls, W1), P(72, 0))]);
};
const leftOffset = (objs: readonly ModelObject[]) =>
  openingOffsets(openingOf(objs, N1), wallOf(objs, W1), wallsOf(objs))?.left;

describe('EZD-212a resizeWall', () => {
  it("EZD-212a done when: a wall typed from 12' to 12' 6\" moves its end", () => {
    const objs = withWindow();
    expect(leftOffset(objs)).toBeCloseTo(54, 9);
    const changed = changedOf(resizeWall(objs, W1, 'end', 150));
    expect(ids(changed)).toEqual([W2, W1, W3]);
    expectLine(wallOf(changed, W1), 0, 0, 150, 0);
    expectLine(wallOf(changed, W2), 150, 0, 150, 120);
    expectLine(wallOf(changed, W3), 150, 120, 0, 120);
    const after = applyChanged(objs, changed);
    expect(areas(after)).toEqual([125]);
    expect(openingOf(after, N1)).toEqual(openingOf(objs, N1));
    expect(leftOffset(after)).toBeCloseTo(54, 9);
  });

  it('EZD-212a done when: a start handle keeps offsets from the start corner', () => {
    const objs = withWindow();
    const changed = changedOf(resizeWall(objs, W1, 'start', 150));
    expect(ids(changed)).toEqual([W4, W1, W3, N1]);
    expectLine(wallOf(changed, W1), -6, 0, 144, 0);
    expectLine(wallOf(changed, W4), -6, 120, -6, 0);
    expectLine(wallOf(changed, W3), 144, 120, -6, 120);
    const c = openingOf(changed, N1).data.geometry.center;
    expect(c.x).toBeCloseTo(66, 9);
    expect(c.y).toBeCloseTo(0, 9);
    expect(leftOffset(applyChanged(objs, changed))).toBeCloseTo(54, 9);
  });

  it("EZD-212a done when: a typed wall size refuses 0 and 200' 0 1/16 and accepts 200'", () => {
    expect(parseLength('0"', 'wall_room')).toMatchObject({ ok: false, reason: 'not_positive' });
    expect(parseLength('200\' 0 1/16"', 'wall_room')).toMatchObject({
      ok: false,
      reason: 'over_max',
    });
    expect(parseLength("200'", 'wall_room')).toEqual({ ok: true, inches: 2400 });

    const objs: ModelObject[] = deepFreeze(room());
    const after = applyChanged(objs, changedOf(resizeWall(objs, W1, 'end', 2400)));
    expect(lenOf(after, W1)).toBeCloseTo(2400, 9);
    expect(lenOf(after, W3)).toBeCloseTo(2400, 9);
    expect(resizeWall(objs, W1, 'end', 2400.0625)).toEqual({
      ok: false,
      reason: 'too_long',
      wallId: W1,
    });
    expect(resizeWall(objs, W1, 'end', 0)).toEqual({
      ok: false,
      reason: 'zero_length',
      wallId: W1,
    });
    expect(resizeWall(objs, W1, 'end', 144)).toEqual({ ok: true, changed: [] });
    expect(resizeWall(objs, W1, 'end', NaN)).toEqual({
      ok: false,
      reason: 'invalid_length',
      wallId: W1,
    });
  });

  it('EZD-212a resizeWall free ends, tees and endDragLength', () => {
    const lone: ModelObject[] = deepFreeze([wallObj(X, P(0, 0), P(100, 0))]);
    expectLine(wallOf(changedOf(resizeWall(lone, X, 'end', 50)), X), 0, 0, 50, 0);
    expectLine(wallOf(changedOf(resizeWall(lone, X, 'start', 50)), X), 50, 0, 100, 0);

    const tee: ModelObject[] = deepFreeze([...room(), partition(60)]);
    expect(resizeWall(tee, PID, 'end', 130)).toEqual({
      ok: false,
      reason: 'join_lost',
      wallId: PID,
    });
    expect(resizeWall(tee, uid(0xff), 'end', 130)).toEqual({
      ok: false,
      reason: 'wall_not_found',
      wallId: uid(0xff),
    });

    const w1 = deepFreeze(wallOf(room(), W1));
    expect(endDragLength(w1, 'end', P(150, 7))).toBeCloseTo(150, 9);
    expect(endDragLength(w1, 'start', P(-6, 3))).toBeCloseTo(150, 9);
    expect(endDragLength(w1, 'end', P(-10, 0))).toBeCloseTo(-10, 9);
  });
});
