// EZD-203 · T11 to T20, T24, and the ticket's Done when (T12) (vault/plans/EZD-203.md sections 3, 4; AC-EZD-203-1,
// -2): moving a wall. Expected values: 09j Moving a wall rows 1-3 (6" east: 12' 6", corners joined, 125 SF, hosted
// items stay; refused at 0"), 09e and 12 Wall move, Q-0568 (200 ft), Q-0570, Q-0583 (a) (join_lost), Q-0598 (b), (d) (cross joins hold), 03g row 2
// (1/64"), plan Decided "Move algorithm", "Delta", "Hosted items", "Purity", "Ids"; L-052 (non-finite input).
import { describe, expect, it } from 'vitest';
import type { ModelObject } from '../schema';
import { pointsEqual } from '../tolerance';
import { moveWall, type MoveWallResult } from './move';
import { wallLength, type WallObject } from './wall';
import {
  deepFreeze,
  door,
  ID,
  LEVEL_2,
  partition,
  roomWalls,
  wallObj,
  windowObj,
} from './test-utils/fixtures';

const { W1, W2, W3, W4, P, X, D1, N1 } = ID;

const changedOf = (r: MoveWallResult): WallObject[] => {
  expect(r.ok).toBe(true);
  return r.ok ? r.changed : [];
};
const ids = (walls: readonly { id: string }[]) => walls.map((w) => w.id);
const get = (walls: readonly WallObject[], id: string): WallObject => {
  const found = walls.find((w) => w.id === id);
  if (!found) throw new Error(`no ${id} in result`);
  return found;
};
const expectLine = (w: WallObject, sx: number, sy: number, ex: number, ey: number) => {
  const g = w.data.geometry;
  expect(g.start.x, `${w.id} start.x`).toBeCloseTo(sx, 9);
  expect(g.start.y, `${w.id} start.y`).toBeCloseTo(sy, 9);
  expect(g.end.x, `${w.id} end.x`).toBeCloseTo(ex, 9);
  expect(g.end.y, `${w.id} end.y`).toBeCloseTo(ey, 9);
};
const lenOf = (w: WallObject) => wallLength(w.data.geometry);

describe('EZD-203 walls core: move', () => {
  it('EZD-203 T11 move 6" east: the east wall moves, the south and north walls stretch to 12\' 6", 125 SF', () => {
    const room = roomWalls(144, 120);
    const changed = changedOf(moveWall(room, W2, { x: 6, y: 0 }));
    expect(ids(changed)).toEqual([W2, W1, W3]);
    expectLine(get(changed, W2), 150, 0, 150, 120);
    expectLine(get(changed, W1), 0, 0, 150, 0);
    expect(lenOf(get(changed, W1))).toBeCloseTo(150, 9);
    expectLine(get(changed, W3), 150, 120, 0, 120);
    expect(lenOf(get(changed, W3))).toBeCloseTo(150, 9);
    for (const w of changed) {
      expect(w.data.attributes).toEqual(get(room, w.id).data.attributes);
    }
    expect((lenOf(get(changed, W1)) * lenOf(get(changed, W2))) / 144).toBeCloseTo(125, 9);
  });

  it('EZD-203 done when: a moved wall keeps corners joined and hosted items in place', () => {
    const objects: ModelObject[] = deepFreeze([...roomWalls(144, 120), door(), windowObj()]);
    const d1Before = structuredClone(objects.find((o) => o.id === D1));
    const n1Before = structuredClone(objects.find((o) => o.id === N1));
    const changed = changedOf(moveWall(objects, W2, { x: 6, y: 0 }));

    for (const w of changed) expect(w.type).toBe('wall');
    expect(ids(changed)).not.toContain(D1);
    expect(ids(changed)).not.toContain(N1);

    const after = objects.map((o) => changed.find((c) => c.id === o.id) ?? o);
    const wall = (id: string) => after.find((o) => o.id === id) as WallObject;
    const corners: [string, string][] = [
      [W1, W2],
      [W2, W3],
      [W3, W4],
      [W4, W1],
    ];
    for (const [a, b] of corners) {
      expect(
        pointsEqual(wall(a).data.geometry.end, wall(b).data.geometry.start),
        `${a}.end = ${b}.start`,
      ).toBe(true);
    }

    const d1 = after.find((o) => o.id === D1);
    const n1 = after.find((o) => o.id === N1);
    expect(d1).toEqual(d1Before);
    expect(n1).toEqual(n1Before);
    expect(d1Before).toMatchObject({
      data: { geometry: { center: { x: 144, y: 60 }, hostWallId: W2 } },
    });
  });

  it('EZD-203 T13 no move: a move within 1/64" changes nothing; 1/32" moves', () => {
    const room = roomWalls(144, 120);
    expect(moveWall(room, W2, { x: 0, y: 0 })).toEqual({ ok: true, changed: [] });
    expect(moveWall(room, W2, { x: 0.015625, y: 0 })).toEqual({ ok: true, changed: [] });
    expect(changedOf(moveWall(room, W2, { x: 0.03125, y: 0 }))).toHaveLength(3);
  });

  it('EZD-203 T14 refused 0": a move that shrinks a wall to nothing is refused and changes nothing', () => {
    const room = roomWalls(144, 120);
    const before = structuredClone(room);
    expect(moveWall(room, W2, { x: -144, y: 0 })).toEqual({
      ok: false,
      reason: 'zero_length',
      wallId: W1,
    });
    expect(room).toEqual(before);
  });

  it('EZD-203 T15 200 ft: a stretched wall may reach 2,400" within 1/64", not beyond', () => {
    const room = roomWalls(2394, 120);
    const exact = changedOf(moveWall(room, W2, { x: 6, y: 0 }));
    expect(lenOf(get(exact, W1))).toBeCloseTo(2400, 9);
    expect(moveWall(room, W2, { x: 6.015625, y: 0 }).ok).toBe(true);
    expect(moveWall(room, W2, { x: 7, y: 0 })).toEqual({
      ok: false,
      reason: 'too_long',
      wallId: W1,
    });
  });

  it('EZD-203 T16 tee follows: moving the south wall carries the partition end; moving the east wall leaves it', () => {
    const walls = [...roomWalls(144, 120), partition(60)];
    const south = changedOf(moveWall(walls, W1, { x: 0, y: -6 }));
    expect(ids(south)).toEqual([W1, W2, W4, P]);
    expectLine(get(south, W1), 0, -6, 144, -6);
    expectLine(get(south, W2), 144, -6, 144, 120);
    expectLine(get(south, W4), 0, 120, 0, -6);
    expectLine(get(south, P), 60, -6, 60, 120);

    const east = changedOf(moveWall(walls, W2, { x: 6, y: 0 }));
    expect(ids(east)).toEqual([W2, W1, W3]);
  });

  it('EZD-203 T17 tee-into: a partition slides along the walls it meets; pulled off them it is refused', () => {
    const walls = [...roomWalls(144, 120), partition(60)];
    const slid = changedOf(moveWall(walls, P, { x: 6, y: 0 }));
    expect(ids(slid)).toEqual([P]);
    expectLine(get(slid, P), 66, 0, 66, 120);
    for (const delta of [
      { x: 0, y: 6 },
      { x: 100, y: 0 },
    ]) {
      expect(moveWall(walls, P, delta), JSON.stringify(delta)).toEqual({
        ok: false,
        reason: 'join_lost',
        wallId: P,
      });
    }
  });

  it('EZD-203 T18 diagonal: corners follow a diagonal move; a tee pulled off the rotated wall is refused', () => {
    const room = roomWalls(144, 120);
    const changed = changedOf(moveWall(room, W2, { x: 6, y: 6 }));
    const w1 = get(changed, W1).data.geometry.end;
    const w3 = get(changed, W3).data.geometry.start;
    expect(w1.x).toBeCloseTo(150, 9);
    expect(w1.y).toBeCloseTo(6, 9);
    expect(w3.x).toBeCloseTo(150, 9);
    expect(w3.y).toBeCloseTo(126, 9);

    expect(moveWall([...room, partition(60)], W2, { x: 6, y: 6 })).toEqual({
      ok: false,
      reason: 'join_lost',
      wallId: W1,
    });
  });

  it('EZD-203 T19 bad input: an unknown or non-wall id is wall_not_found; a non-finite delta is invalid_delta', () => {
    const room = roomWalls(144, 120);
    expect(moveWall(room, 'nope', { x: 6, y: 0 })).toEqual({
      ok: false,
      reason: 'wall_not_found',
      wallId: 'nope',
    });
    expect(moveWall([...room, door()], D1, { x: 6, y: 0 })).toEqual({
      ok: false,
      reason: 'wall_not_found',
      wallId: D1,
    });
    expect(moveWall([], W2, { x: 6, y: 0 })).toEqual({
      ok: false,
      reason: 'wall_not_found',
      wallId: W2,
    });
    for (const delta of [
      { x: Number.NaN, y: 0 },
      { x: Number.POSITIVE_INFINITY, y: 0 },
      { x: 0, y: Number.NaN },
      { x: 0, y: Number.NEGATIVE_INFINITY },
    ]) {
      expect(moveWall(room, W2, delta), String(delta.x) + ',' + String(delta.y)).toEqual({
        ok: false,
        reason: 'invalid_delta',
        wallId: W2,
      });
    }
  });

  it('EZD-203 T20 levels, purity: walls on another level are untouched; frozen input is not mutated', () => {
    const level2Ids = [
      '00000000-0000-4000-8000-0000000000c1',
      '00000000-0000-4000-8000-0000000000c2',
      '00000000-0000-4000-8000-0000000000c3',
      '00000000-0000-4000-8000-0000000000c4',
    ];
    const level2 = roomWalls(144, 120, LEVEL_2).map((w, i) => ({ ...w, id: level2Ids[i] }));
    const objects = deepFreeze([...roomWalls(144, 120), ...level2]);
    let result: MoveWallResult | undefined;
    expect(() => {
      result = moveWall(objects, W2, { x: 6, y: 0 });
    }).not.toThrow();
    const changed = changedOf(result as MoveWallResult);
    expect(ids(changed)).toEqual([W2, W1, W3]);
    for (const w of changed) {
      expect(w).not.toBe(objects.find((o) => o.id === w.id));
    }
    const w2In = objects.find((o) => o.id === W2) as WallObject;
    expect(w2In.data.geometry.start).toEqual({ x: 144, y: 0 });
  });

  it('EZD-203 T24 cross holds: walls that cross may move while they still meet; pulled apart they are refused', () => {
    const walls = [...roomWalls(144, 120), wallObj(X, { x: 72, y: -12 }, { x: 72, y: 12 })];

    const south = changedOf(moveWall(walls, W1, { x: 0, y: -6 }));
    expect(ids(south)).toEqual([W1, W2, W4]);
    expectLine(get(south, W1), 0, -6, 144, -6);
    expectLine(get(south, W2), 144, -6, 144, 120);
    expectLine(get(south, W4), 0, 120, 0, -6);
    expect(ids(south)).not.toContain(X);

    expect(moveWall(walls, W1, { x: 0, y: -20 })).toEqual({
      ok: false,
      reason: 'join_lost',
      wallId: W1,
    });

    const cross = changedOf(moveWall(walls, X, { x: 0, y: 6 }));
    expect(ids(cross)).toEqual([X]);
    expectLine(get(cross, X), 72, -6, 72, 18);

    expect(moveWall(walls, X, { x: 0, y: 20 })).toEqual({
      ok: false,
      reason: 'join_lost',
      wallId: X,
    });
  });
});
