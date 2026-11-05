// EZD-203 · T7 to T10 (vault/plans/EZD-203.md sections 3, 4; AC-EZD-203-2, -5): wall joins. Expected values: 09e
// (corners join), Q-0570 (a wall dividing a room tees into it), Q-0598 (a), (c) (a crossing is a `cross` join),
// 03g rows 2-3 (1/64" inclusive), plan Decided "Joins", "Join order" and "Degenerate walls".
import { describe, expect, it } from 'vitest';
import { findWallJoins } from './joins';
import { wallFaceLines, type WallObject } from './wall';
import { ID, LEVEL_1, LEVEL_2, partition, roomWalls, wallObj } from './test-utils/fixtures';

const { W1, W2, W3, W4, P, X, Z } = ID;

describe('EZD-203 walls core: joins', () => {
  it('EZD-203 T7 corner joins: the east wall of a room joins the south and north walls at its ends', () => {
    expect(findWallJoins(roomWalls(144, 120), W2)).toEqual([
      { kind: 'corner', end: 'start', otherId: W1, otherEnd: 'end' },
      { kind: 'corner', end: 'end', otherId: W3, otherEnd: 'start' },
    ]);
  });

  it('EZD-203 T8 tee joins: a partition tees into the south and north walls', () => {
    const walls = [...roomWalls(144, 120), partition(60)];
    expect(findWallJoins(walls, W1)).toEqual([
      { kind: 'corner', end: 'end', otherId: W2, otherEnd: 'start' },
      { kind: 'corner', end: 'start', otherId: W4, otherEnd: 'end' },
      { kind: 'tee-on', otherId: P, otherEnd: 'start' },
    ]);
    expect(findWallJoins(walls, P)).toEqual([
      { kind: 'tee-into', end: 'start', otherId: W1 },
      { kind: 'tee-into', end: 'end', otherId: W3 },
    ]);
  });

  it('EZD-203 T9 tolerance, level: ends within 1/64" join; beyond do not; another level never joins', () => {
    const withW2Start = (x: number): WallObject[] =>
      roomWalls(144, 120).map((w) =>
        w.id === W2
          ? { ...w, data: { ...w.data, geometry: { ...w.data.geometry, start: { x, y: 0 } } } }
          : w,
      );

    const kept = withW2Start(144.015625);
    expect(findWallJoins(kept, W2)).toContainEqual({
      kind: 'corner',
      end: 'start',
      otherId: W1,
      otherEnd: 'end',
    });
    expect(findWallJoins(kept, W1)).toContainEqual({
      kind: 'corner',
      end: 'end',
      otherId: W2,
      otherEnd: 'start',
    });

    const lost = withW2Start(144.0157);
    expect(findWallJoins(lost, W2).filter((j) => j.otherId === W1)).toEqual([]);
    expect(findWallJoins(lost, W1).filter((j) => j.otherId === W2)).toEqual([]);

    const copy = wallObj(X, { x: 0, y: 0 }, { x: 144, y: 0 }, { level: LEVEL_2 });
    const joins = findWallJoins([...roomWalls(144, 120), copy], W2);
    expect(joins.filter((j) => j.otherId === X)).toEqual([]);
  });

  it('EZD-203 T10 crossing, empty, degenerate: a crossing is a cross join; no joins for an unknown id or a zero-length wall', () => {
    const room = roomWalls(144, 120);
    const crossing = wallObj(X, { x: 72, y: -12 }, { x: 72, y: 12 });
    expect(findWallJoins([...room, crossing], X)).toEqual([{ kind: 'cross', otherId: W1 }]);
    expect(findWallJoins([...room, crossing], W1)).toEqual([
      { kind: 'corner', end: 'end', otherId: W2, otherEnd: 'start' },
      { kind: 'corner', end: 'start', otherId: W4, otherEnd: 'end' },
      { kind: 'cross', otherId: X },
    ]);
    expect(findWallJoins(room, 'nope')).toEqual([]);
    expect(findWallJoins([], W1)).toEqual([]);

    const base = room[0].data;
    const z: WallObject = {
      id: Z,
      type: 'wall',
      data: {
        ...base,
        level: LEVEL_1,
        geometry: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      },
    };
    const withZ = [...room, z];
    expect(findWallJoins(withZ, Z)).toEqual([]);
    expect(findWallJoins(withZ, W1)).toEqual([
      { kind: 'corner', end: 'end', otherId: W2, otherEnd: 'start' },
      { kind: 'corner', end: 'start', otherId: W4, otherEnd: 'end' },
    ]);
    const faces = wallFaceLines(z.data);
    for (const face of [faces.left, faces.right]) {
      for (const v of [face.start.x, face.start.y, face.end.x, face.end.y])
        expect(v).toBeCloseTo(0, 9);
    }
  });
});
