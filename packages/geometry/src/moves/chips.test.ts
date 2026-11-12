// EZD-212a · C1 to C6 (vault/plans/EZD-212a.md section 4; AC-EZD-212-14): the live distance chips, their display
// and typing a chip value. Expected values: Q-0630 rows 10, 14; 09k Chip partition (4' 10"), Chip display, Chip
// typed; Q-0568 rounding; 03g; P204b F2 offsets; plan Decided "Wall chips", "Opening chips", "`selectionChips`",
// "`formatChipDistance`", "`applyChip`".
import { describe, expect, it } from 'vitest';
import { openingOffsets } from '../openings/offsets';
import type { OpeningObject } from '../openings/opening';
import { roomAreaSqFt } from '../rooms/area';
import { findRoomOutlines } from '../rooms/outlines';
import { applyChanged, uid } from '../rooms/test-utils/fixtures';
import type { ModelObject, Point } from '../schema';
import { wallFaceLines, type WallObject } from '../walls/wall';
import {
  deepFreeze,
  ID,
  LEVEL_1,
  LEVEL_2,
  partition,
  roomWalls,
  wallObj,
} from '../walls/test-utils/fixtures';
import {
  applyChip,
  formatChipDistance,
  openingChips,
  selectionChips,
  wallChips,
  type ApplyChipResult,
  type Chip,
} from './chips';
import { flaggedObj, openingObj, Y1, Y2 } from './test-utils/fixtures';

const { W1, W2, W4, P: PID, X, Z, D1 } = ID;
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
const doorOnW1 = (x: number) => openingObj(D1, 'door', wallOf(room(), W1), P(x, 0));
const expectPoint = (got: Point, x: number, y: number, label: string) => {
  expect(got.x, `${label}.x`).toBeCloseTo(x, 9);
  expect(got.y, `${label}.y`).toBeCloseTo(y, 9);
};
type ChipWant = {
  kind: 'wall' | 'opening';
  side: 'left' | 'right';
  distance: number;
  other: string | null;
  from: [number, number];
  to: [number, number];
};
const expectChips = (got: readonly Chip[], want: readonly ChipWant[]) => {
  expect(got).toHaveLength(want.length);
  want.forEach((w, i) => {
    const c = got[i]!;
    const label = `chip ${i}`;
    expect(c.kind, `${label} kind`).toBe(w.kind);
    expect(c.side, `${label} side`).toBe(w.side);
    expect(c.distance, `${label} distance`).toBeCloseTo(w.distance, 9);
    if (c.kind === 'wall') expect(c.neighborId, `${label} neighborId`).toBe(w.other);
    else expect(c.cornerWallId, `${label} cornerWallId`).toBe(w.other);
    expectPoint(c.from, w.from[0], w.from[1], `${label} from`);
    expectPoint(c.to, w.to[0], w.to[1], `${label} to`);
  });
};
const changedOf = (r: ApplyChipResult): ModelObject[] => {
  expect(r.ok).toBe(true);
  return r.ok ? r.changed : [];
};

describe('EZD-212a distance chips', () => {
  it('EZD-212a wall chips measure to the nearest parallel face', () => {
    const objs: ModelObject[] = deepFreeze(room());
    expectChips(wallChips(objs, W2), [
      { kind: 'wall', side: 'left', distance: 144, other: W4, from: [144, 60], to: [0, 60] },
    ]);
    const tee: ModelObject[] = deepFreeze([...room(), partition(60)]);
    expectChips(wallChips(tee, PID), [
      { kind: 'wall', side: 'left', distance: 57.75, other: W4, from: [57.75, 60], to: [0, 60] },
      {
        kind: 'wall',
        side: 'right',
        distance: 81.75,
        other: W2,
        from: [62.25, 60],
        to: [144, 60],
      },
    ]);
  });

  it('EZD-212a wall chips skip skewed, distant and other-floor walls', () => {
    const skip: ModelObject[] = deepFreeze([
      ...room(),
      wallObj(X, P(100, 200), P(100, 300)),
      wallObj(Z, P(100, 0), P(100, 120), { level: LEVEL_2 }),
      wallObj(PID, P(100, 0), P(100.02, 120)),
    ]);
    expectChips(wallChips(skip, W2), [
      { kind: 'wall', side: 'left', distance: 144, other: W4, from: [144, 60], to: [0, 60] },
    ]);
    const split: ModelObject[] = deepFreeze([
      ...room(),
      wallObj(Y2, P(100, 0), P(100, 60)),
      wallObj(Y1, P(100, 60), P(100, 120)),
    ]);
    expectChips(wallChips(split, W2), [
      { kind: 'wall', side: 'left', distance: 39.5, other: Y1, from: [144, 90], to: [104.5, 90] },
    ]);
  });

  it('EZD-212a opening chips and selection chips', () => {
    const objs: ModelObject[] = deepFreeze([...room(), doorOnW1(54)]);
    const want: ChipWant[] = [
      { kind: 'opening', side: 'left', distance: 36, other: W4, from: [36, 0], to: [0, 0] },
      { kind: 'opening', side: 'right', distance: 72, other: W2, from: [72, 0], to: [144, 0] },
    ];
    expectChips(openingChips(objs, D1), want);
    expectChips(selectionChips(objs, [D1]), want);
    expect(selectionChips(objs, [D1, W2])).toEqual([]);
    expect(selectionChips(objs, [])).toEqual([]);
    const flagged: ModelObject[] = deepFreeze([...room(), flaggedObj(doorOnW1(54), P(1, 0))]);
    expect(openingChips(flagged, D1)).toEqual([]);
  });

  it('EZD-212a chips show at 1/2 inch', () => {
    expect(formatChipDistance(46.75)).toBe('3\' 11"');
    expect(formatChipDistance(46.6)).toBe('3\' 10 1/2"');
    expect(formatChipDistance(0)).toBe('0"');
    expect(formatChipDistance(-0.01)).toBe('0"');
  });

  it('EZD-212a done when: a door chip of 24 inches leaves 84 and 109 is refused', () => {
    const walls = room();
    const objs: ModelObject[] = deepFreeze([...walls, doorOnW1(54)]);
    const changed = changedOf(applyChip(objs, D1, 'left', 24));
    expect(changed).toHaveLength(1);
    const door = openingOf(changed, D1);
    expectPoint(door.data.geometry.center, 42, 0, 'left 24');
    const offsets = openingOffsets(door, wallOf(walls, W1), walls);
    expect(offsets?.left).toBeCloseTo(24, 9);
    expect(offsets?.right).toBeCloseTo(84, 9);

    expect(applyChip(objs, D1, 'left', 109)).toEqual({ ok: false, reason: 'past_corner', id: D1 });
    for (const bad of [-1, NaN, Infinity]) {
      expect(applyChip(objs, D1, 'left', bad), String(bad)).toEqual({
        ok: false,
        reason: 'invalid_input',
        id: D1,
      });
    }
    expectPoint(
      openingOf(changedOf(applyChip(objs, D1, 'right', 0)), D1).data.geometry.center,
      126,
      0,
      'right 0',
    );
  });

  it('EZD-212a done when: a partition chip typed 60 gives rooms of 50 and 66 SF', () => {
    const objs: ModelObject[] = deepFreeze([...room(), partition(60)]);
    const after = applyChanged(objs, changedOf(applyChip(objs, PID, 'left', 60)));
    const p = wallOf(after, PID);
    expect(p.data.geometry.start.x).toBeCloseTo(62.25, 9);
    expect(p.data.geometry.end.x).toBeCloseTo(62.25, 9);
    const faces = wallFaceLines(p.data);
    const faceXs = [faces.left.start.x, faces.right.start.x].sort((a, b) => a - b);
    expect(faceXs[0]).toBeCloseTo(60, 9);
    expect(faceXs[1]).toBeCloseTo(64.5, 9);
    const areas = findRoomOutlines(wallsOf(after), LEVEL_1)
      .map((o) => roomAreaSqFt(o.boundary))
      .sort((a, b) => a - b);
    expect(areas).toEqual([50, 66]);

    const plain: ModelObject[] = deepFreeze(room());
    expect(applyChip(plain, W2, 'right', 5)).toEqual({ ok: false, reason: 'no_chip', id: W2 });
    expect(applyChip(plain, uid(0xff), 'left', 5)).toEqual({
      ok: false,
      reason: 'not_found',
      id: uid(0xff),
    });
  });
});
