// EZD-205b · AB1 to AB3: absorbing a gap into a parallel wall of its chain (vault/plans/EZD-205b.md section 1
// Decided "Absorb steps", "Absorb change"; section 4; AC-EZD-205-3). Expected values: 09j Absorbing rows 1-5;
// 09e (stretch); S02 Decisions; Q-0207; Q-0568; Q-0570; P203 `wallLengthProblem` and `moveWall` tee-on rule.
import { describe, expect, it } from 'vitest';
import type { ModelObject, Point } from '../schema';
import { wallLength, type WallObject } from '../walls/wall';
import { absorbGap, type AbsorbResult } from './absorb';
import { outlineAreaSqIn, roomAreaSqFt } from './area';
import { findClosures, type GapReport } from './closure';
import { reconcileRooms } from './sync';
import { applyChanged, chain, F1, idSeq, openChain, uid, wallObj } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const ROW2 = openChain(1, [P(0, 0), P(144, 0), P(144, 120), P(0, 120), P(0, 0.5)]);
const IDS4 = [uid(1), uid(2), uid(3), uid(4)];

function expectPoint(got: Point, want: Point, label: string): void {
  expect(got.x, `${label} x`).toBeCloseTo(want.x, 9);
  expect(got.y, `${label} y`).toBeCloseTo(want.y, 9);
}

function expectWall(w: WallObject | undefined, id: string, start: Point, end: Point): void {
  expect(w, id).toBeDefined();
  expect(w!.id).toBe(id);
  expectPoint(w!.data.geometry.start, start, `${id} start`);
  expectPoint(w!.data.geometry.end, end, `${id} end`);
}

function changedOf(r: AbsorbResult, label: string): WallObject[] {
  expect(r.ok, label).toBe(true);
  if (!r.ok) throw new Error(`${label}: refused ${r.reason}`);
  return r.changed;
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

describe('EZD-205b absorb a gap', () => {
  it('AB1 absorbing rows 1 and 2 close the room at 120 SF', () => {
    const by4 = changedOf(absorbGap(ROW2, IDS4, uid(4)), 'uid(4)');
    expect(by4).toHaveLength(1);
    expectWall(by4[0], uid(4), P(0, 120), P(0, 0));
    const r4 = reconcileRooms(applyChanged(ROW2, by4), F1, idSeq(900));
    expect(r4.update).toEqual([]);
    expect(r4.delete).toEqual([]);
    expect(r4.create).toHaveLength(1);
    expect(roomAreaSqFt(r4.create[0]!.data.geometry.boundary)).toBe(120);

    const by2 = changedOf(absorbGap(ROW2, IDS4, uid(2)), 'uid(2)');
    expect(by2).toHaveLength(3);
    expectWall(by2[0], uid(2), P(144, 0), P(144, 119.5));
    expectWall(by2[1], uid(3), P(144, 119.5), P(0, 119.5));
    expectWall(by2[2], uid(4), P(0, 119.5), P(0, 0));
    const r2 = reconcileRooms(applyChanged(ROW2, by2), F1, idSeq(900));
    expect(r2.update).toEqual([]);
    expect(r2.delete).toEqual([]);
    expect(r2.create).toHaveLength(1);
    expect(outlineAreaSqIn(r2.create[0]!.data.geometry.boundary)).toBeCloseTo(17208, 6);
    expect(roomAreaSqFt(r2.create[0]!.data.geometry.boundary)).toBe(120);
  });

  it('AB2 refusals: across, another room, no chain, stale gap, zero and too long', () => {
    const objs: ModelObject[] = [
      ...ROW2,
      ...chain(20, [P(300, 0), P(444, 0), P(444, 120), P(300, 120)]),
    ];
    expect(absorbGap(objs, IDS4, uid(1))).toEqual({
      ok: false,
      reason: 'across_gap',
      wallId: uid(1),
    });
    expect(absorbGap(objs, IDS4, uid(3))).toEqual({
      ok: false,
      reason: 'across_gap',
      wallId: uid(3),
    });
    expect(absorbGap(objs, IDS4, uid(20))).toEqual({
      ok: false,
      reason: 'not_in_chain',
      wallId: uid(20),
    });
    const missing = '00000000-0000-4000-8000-0000000000ff';
    expect(absorbGap(objs, IDS4, missing)).toEqual({
      ok: false,
      reason: 'wall_not_found',
      wallId: missing,
    });
    expect(absorbGap(objs, [uid(20), uid(21), uid(22), uid(23)], uid(2))).toEqual({
      ok: false,
      reason: 'no_gap',
      wallId: uid(2),
    });
    expect(absorbGap(objs, [], uid(2))).toEqual({ ok: false, reason: 'no_gap', wallId: uid(2) });

    const short = openChain(1, [P(0, 0), P(144, 0), P(144, 12), P(0, 12)]);
    expect(absorbGap(short, [uid(1), uid(2), uid(3)], uid(2))).toEqual({
      ok: false,
      reason: 'zero_length',
      wallId: uid(2),
    });
    const shortReports = findClosures(short, F1);
    expect(shortReports).toHaveLength(1);
    expect(shortReports[0]!.kind).toBe('gap');
    expect((shortReports[0] as GapReport).parallelWallIds).toContain(uid(2));

    const long = openChain(1, [
      P(0, 0),
      P(2400, 0),
      P(2400, 120),
      P(1200, 120),
      P(-0.5, 120),
      P(-0.5, 0),
    ]);
    const longIds = [uid(1), uid(2), uid(3), uid(4), uid(5)];
    expect(absorbGap(long, longIds, uid(1))).toEqual({
      ok: false,
      reason: 'too_long',
      wallId: uid(1),
    });
    const by4 = changedOf(absorbGap(long, longIds, uid(4)), 'long uid(4)');
    const w4 = by4.find((w) => w.id === uid(4));
    expect(w4).toBeDefined();
    expect(wallLength(w4!.data.geometry)).toBeCloseTo(1200, 9);
  });

  it('AB3 partitions stretch, a lost tee is refused, input untouched', () => {
    const withPartition: ModelObject[] = deepFreeze([
      ...ROW2,
      wallObj(uid(8), P(72, 0), P(72, 120), 'center'),
    ]);
    const ids = deepFreeze([...IDS4]);
    const before1 = structuredClone(withPartition);
    const changed = changedOf(absorbGap(withPartition, ids, uid(2)), 'partition');
    expectWall(changed[changed.length - 1], uid(8), P(72, 0), P(72, 119.5));
    expect(withPartition).toEqual(before1);
    expect(ids).toEqual(IDS4);

    const withTee: ModelObject[] = deepFreeze([
      ...ROW2,
      wallObj(uid(9), P(144, 119.8), P(200, 119.8)),
    ]);
    const before2 = structuredClone(withTee);
    expect(absorbGap(withTee, ids, uid(2))).toEqual({
      ok: false,
      reason: 'join_lost',
      wallId: uid(2),
    });
    expect(withTee).toEqual(before2);
  });
});
