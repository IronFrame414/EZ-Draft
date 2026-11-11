// EZD-212a · S1 to S7 (vault/plans/EZD-212a.md section 4; AC-EZD-212-4, -5, -11, -20): moving a selection and the
// typed move delta. Expected values: 09j Moving a wall rows 1-3, Keep out of square; 09k Typed move rows; 03g Typed
// lengths (halfway up); Q-0568; Q-0570; Q-0630 rows 8, 11; plan Decided "`typedMoveDelta`", "`moveSelection`",
// "Lone hosted opening in a move"; L-052 (non-finite input).
import { describe, expect, it } from 'vitest';
import { formatLength, parseLength } from '../length';
import { openingOnWall } from '../openings/offsets';
import type { OpeningObject } from '../openings/opening';
import { roomAreaSqFt, outlineAreaSqIn } from '../rooms/area';
import { findClosures, type GapReport } from '../rooms/closure';
import { findRoomOutlines } from '../rooms/outlines';
import { keepOutOfSquare } from '../rooms/override';
import { reconcileRooms, type RoomObject } from '../rooms/sync';
import { applyChanged, F1, idSeq, openChain, uid } from '../rooms/test-utils/fixtures';
import type { ModelObject, Point } from '../schema';
import { findWallJoins } from '../walls/joins';
import { wallLength, type WallObject } from '../walls/wall';
import { deepFreeze, ID, LEVEL_1, roomWalls } from '../walls/test-utils/fixtures';
import { moveSelection, typedMoveDelta, type MoveSelectionResult } from './selection';
import { D2, flaggedObj, openingObj } from './test-utils/fixtures';

const { W1, W2, W3, D1, N1 } = ID;
const P = (x: number, y: number): Point => ({ x, y });
const WHEN = '2026-11-06T12:00:00.000Z';

const room = () => roomWalls(144, 120);
const wallOf = (objs: readonly ModelObject[], id: string): WallObject => {
  const w = objs.find((o) => o.id.toLowerCase() === id.toLowerCase() && o.type === 'wall');
  if (!w) throw new Error(`no wall ${id}`);
  return w as WallObject;
};
const openingOf = (objs: readonly ModelObject[], id: string): OpeningObject => {
  const o = objs.find((x) => x.id.toLowerCase() === id.toLowerCase() && x.type === 'opening');
  if (!o) throw new Error(`no opening ${id}`);
  return o as OpeningObject;
};
const doorOnW1 = (x: number) => openingObj(D1, 'door', wallOf(room(), W1), P(x, 0));
const changedOf = (r: MoveSelectionResult): ModelObject[] => {
  expect(r.ok).toBe(true);
  return r.ok ? r.changed : [];
};
const ids = (objs: readonly { id: string }[]) => objs.map((o) => o.id);
const wallsOf = (objs: readonly ModelObject[]) =>
  objs.filter((o): o is WallObject => o.type === 'wall');
const areas = (objs: readonly ModelObject[], level: string) =>
  findRoomOutlines(wallsOf(objs), level)
    .map((o) => roomAreaSqFt(o.boundary))
    .sort((a, b) => a - b);
const lenOf = (objs: readonly ModelObject[], id: string) =>
  wallLength(wallOf(objs, id).data.geometry);
const expectPoint = (got: Point, x: number, y: number, label = 'point') => {
  expect(got.x, `${label}.x`).toBeCloseTo(x, 9);
  expect(got.y, `${label}.y`).toBeCloseTo(y, 9);
};
const delta = (distance: number, direction: Point): Point => {
  const d = typedMoveDelta(distance, direction);
  expect(d).not.toBeNull();
  return d ?? P(0, 0);
};
const inches = (text: string): number => {
  const r = parseLength(text, 'other');
  expect(r.ok, text).toBe(true);
  return r.ok ? r.inches : NaN;
};

// S4's open row 2 chain and the room Keep out of square stores on it.
function row2WithRoom(): { objs: ModelObject[]; R: RoomObject } {
  const ROW2 = openChain(1, [P(0, 0), P(144, 0), P(144, 120), P(0, 120), P(0, 0.5)]);
  const kept = keepOutOfSquare(ROW2, [uid(1), uid(2), uid(3), uid(4)], uid(7), WHEN, idSeq(900));
  expect(kept.ok).toBe(true);
  if (!kept.ok) throw new Error('keepOutOfSquare refused');
  const R = kept.rooms.create[0]!;
  return { objs: [...ROW2, R], R };
}

describe('EZD-212a moveSelection', () => {
  it('EZD-212a done when: the east wall moved 6 inches east gives 12\' 6" walls and 125 SF', () => {
    const walls = room();
    const objs: ModelObject[] = deepFreeze([
      ...walls,
      openingObj(D1, 'door', wallOf(walls, W2), P(144, 60)),
      openingObj(N1, 'window', wallOf(walls, W1), P(72, 0)),
    ]);
    const changed = changedOf(moveSelection(objs, [W2], delta(6, P(1, 0))));
    expect(ids(changed)).toEqual([W2, W1, W3]);
    const after = applyChanged(objs, changed);
    expect(formatLength(lenOf(after, W1), 2)).toBe('12\' 6"');
    expect(formatLength(lenOf(after, W3), 2)).toBe('12\' 6"');
    const joins = findWallJoins(wallsOf(after), W2);
    const cornerIds = joins.filter((j) => j.kind === 'corner').map((j) => j.otherId);
    expect(cornerIds).toContain(W1);
    expect(cornerIds).toContain(W3);
    expect(areas(after, LEVEL_1)).toEqual([125]);
    expectPoint(openingOf(after, D1).data.geometry.center, 144, 60, 'door');
    expectPoint(openingOf(after, N1).data.geometry.center, 72, 0, 'window');
  });

  it("EZD-212a done when: a typed move of 0 or 1/64 inch changes nothing and 12' west is refused", () => {
    const objs: ModelObject[] = deepFreeze(room());
    const zero = inches('0"');
    const sixtyFourth = inches('1/64"');
    const twelveFeet = inches("12'");
    expect(zero).toBe(0);
    expect(sixtyFourth).toBe(0);
    expect(twelveFeet).toBe(144);
    expect(moveSelection(objs, [W2], delta(zero, P(1, 0)))).toEqual({ ok: true, changed: [] });
    expect(moveSelection(objs, [W2], delta(sixtyFourth, P(1, 0)))).toEqual({
      ok: true,
      changed: [],
    });
    expect(moveSelection(objs, [W2], delta(twelveFeet, P(-1, 0)))).toEqual({
      ok: false,
      reason: 'zero_length',
      id: W1,
    });
  });

  it("EZD-212a done when: typed moves of 6 1/32, 11' 11 15/16 and 188 feet", () => {
    const objs: ModelObject[] = deepFreeze(room());

    const east = applyChanged(
      objs,
      changedOf(moveSelection(objs, [W2], delta(inches('6 1/32"'), P(1, 0)))),
    );
    expect(lenOf(east, W1)).toBeCloseTo(150.0625, 9);
    expect(formatLength(lenOf(east, W1), 2)).toBe('12\' 6"');
    expect(areas(east, LEVEL_1)).toEqual([125]);

    const west = applyChanged(
      objs,
      changedOf(moveSelection(objs, [W2], delta(inches('11\' 11 15/16"'), P(-1, 0)))),
    );
    expect(lenOf(west, W1)).toBeCloseTo(0.0625, 9);
    const outlines = findRoomOutlines(wallsOf(west), LEVEL_1);
    expect(outlines).toHaveLength(1);
    expect(outlineAreaSqIn(outlines[0]!.boundary)).toBeCloseTo(7.5, 9);
    expect(areas(west, LEVEL_1)).toEqual([0]);

    const far = applyChanged(
      objs,
      changedOf(moveSelection(objs, [W2], delta(inches("188'"), P(1, 0)))),
    );
    expect(lenOf(far, W1)).toBeCloseTo(2400, 9);
    expect(lenOf(far, W3)).toBeCloseTo(2400, 9);
    expect(areas(far, LEVEL_1)).toEqual([2000]);

    expect(moveSelection(objs, [W2], delta(inches('188\' 0 1/16"'), P(1, 0)))).toEqual({
      ok: false,
      reason: 'too_long',
      id: W1,
    });
  });

  it('EZD-212a done when: a move that changes a kept gap clears the override', () => {
    const { objs, R } = row2WithRoom();
    deepFreeze(objs);

    const after = applyChanged(objs, changedOf(moveSelection(objs, [uid(1)], P(0, 0.25))));
    const rec = reconcileRooms(after, F1, idSeq(950));
    expect(rec.update).toHaveLength(1);
    expect(rec.update[0]!.id).toBe(uid(900));
    expect(rec.update[0]!.data.closureOverride).toBeNull();
    const gaps = findClosures(wallsOf(after), F1).filter((r): r is GapReport => r.kind === 'gap');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.sizeIn).toBeCloseTo(0.25, 9);

    const control = applyChanged(objs, changedOf(moveSelection(objs, [uid(2)], P(6, 0))));
    const kept = reconcileRooms(control, F1, idSeq(950));
    expect(kept.update[0]!.data.closureOverride).toEqual(R.data.closureOverride);
  });

  it('EZD-212a a selected wall and door move together', () => {
    const walls = room();
    const objs: ModelObject[] = deepFreeze([
      ...walls,
      openingObj(D1, 'door', wallOf(walls, W2), P(144, 60)),
      openingObj(N1, 'window', wallOf(walls, W1), P(72, 0)),
    ]);
    const changed = changedOf(moveSelection(objs, [W2.toUpperCase(), D1], P(6, 0)));
    expect(ids(changed)).toEqual([W2, W1, W3, D1]);
    const door = openingOf(changed, D1);
    expectPoint(door.data.geometry.center, 150, 60, 'door');
    expect(door.data.geometry.hostWallId).toBe(W2);
    expect(openingOnWall(door, wallOf(changed, W2))).toBe(true);
    expect(ids(changed)).not.toContain(N1);
  });

  it('EZD-212a a lone hosted door slides along its wall', () => {
    const objs: ModelObject[] = deepFreeze([...room(), doorOnW1(54)]);
    expectPoint(
      openingOf(changedOf(moveSelection(objs, [D1], P(24, 30))), D1).data.geometry.center,
      78,
      0,
      'slid',
    );
    expectPoint(
      openingOf(changedOf(moveSelection(objs, [D1], P(200, 0))), D1).data.geometry.center,
      126,
      0,
      'clamped',
    );
    const two: ModelObject[] = deepFreeze([
      ...room(),
      doorOnW1(54),
      openingObj(D2, 'door', wallOf(room(), W1), P(110, 0)),
    ]);
    expect(moveSelection(two, [D1], P(40, 0))).toEqual({ ok: true, changed: [] });
  });

  it('EZD-212a flagged openings, bad ids and typedMoveDelta', () => {
    const walls = room();
    const flagged = flaggedObj(openingObj(D1, 'door', wallOf(walls, W1), P(72, 60)), P(1, 0));
    const objs: ModelObject[] = deepFreeze([...walls, flagged]);
    expectPoint(
      openingOf(changedOf(moveSelection(objs, [D1], P(10, 5))), D1).data.geometry.center,
      82,
      65,
      'flagged',
    );
    expect(moveSelection(objs, [uid(0xff)], P(6, 0))).toEqual({
      ok: false,
      reason: 'not_found',
      id: uid(0xff),
    });
    expect(moveSelection(objs, [ID.W2], P(NaN, 0))).toEqual({
      ok: false,
      reason: 'invalid_delta',
      id: ID.W2,
    });
    expect(moveSelection(objs, [ID.W2], P(0, Infinity))).toEqual({
      ok: false,
      reason: 'invalid_delta',
      id: ID.W2,
    });
    const { objs: withRoom } = row2WithRoom();
    deepFreeze(withRoom);
    expect(moveSelection(withRoom, [uid(900)], P(6, 0))).toEqual({
      ok: false,
      reason: 'not_found',
      id: uid(900),
    });

    expect(typedMoveDelta(5, P(0, 0))).toBeNull();
    expect(typedMoveDelta(NaN, P(1, 0))).toBeNull();
    expect(typedMoveDelta(-1, P(1, 0))).toBeNull();
    const d = typedMoveDelta(5, P(3, 4));
    expect(d).not.toBeNull();
    expectPoint(d ?? P(NaN, NaN), 3, 4, 'typed 5');
    const z = typedMoveDelta(0, P(3, 4));
    expect(z).toEqual({ x: 0, y: 0 });
    expect(Object.is(z?.x, 0)).toBe(true);
    expect(Object.is(z?.y, 0)).toBe(true);
  });
});
