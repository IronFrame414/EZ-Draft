// EZD-208a P1-P5 (vault/plans/EZD-208a.md section 4; section 1 R1, R17; section 3 A8, A9; AC-EZD-208-10, -11, -12,
// -18). Expected values: the plan's rows and their cited sources (R1: Q-0630 rows 7, 8; AC-10 cell size 48), never
// the code. No browser, no live service.
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  parseStoredObject,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Objects } from '../model/patches';
import { baseObjects, F1, F2, roomValue, uid, withWalls } from '../tools/test-utils/fixtures';
import { createPickIndex } from './pick-index';

const pt = (x: number, y: number): Point => ({ x, y });
const TOL = 3.75;

function wallOf(objects: Objects, id: string): WallObject {
  const v = objects.get(id);
  if (v === undefined) throw new Error(`no ${id}`);
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  if (!r.ok || r.object.type !== 'wall') throw new Error(`${id} is not a wall`);
  return r.object;
}

function openingValue(
  kind: 'door' | 'window',
  host: WallObject,
  center: Point,
  over?: { hostWallId: string | null; axis: Point | null },
): ObjectValue {
  const made = createOpeningData({ kind, host, center });
  const data = over === undefined ? made : { ...made, geometry: { center, ...over } };
  return {
    type: 'opening',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: data as unknown as Record<string, unknown>,
  };
}

const C1 = () => withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0)], false, 'center');
function c1WithDoor(): Map<string, ObjectValue> {
  const o = C1();
  o.set(uid(2), openingValue('door', wallOf(o, uid(1)), pt(72, 0)));
  return o;
}

function expectBody(got: readonly Point[] | null, want: readonly Point[]): void {
  expect(got).not.toBeNull();
  expect(got).toHaveLength(want.length);
  want.forEach((w, i) => {
    expect(got![i]!.x).toBeCloseTo(w.x, 9);
    expect(got![i]!.y).toBeCloseTo(w.y, 9);
  });
}

describe('EZD-208a pick index', () => {
  it('EZD-208a P1 pick order, ties, flags and missing hosts', () => {
    let o = c1WithDoor();
    o = withWalls(o, 4, [pt(0, 100), pt(144, 100)], false, 'right');
    o = withWalls(o, 3, [pt(0, 100), pt(144, 100)], false, 'right');
    o.set(
      uid(5),
      openingValue('window', wallOf(o, uid(1)), pt(200, 50), { hostWallId: null, axis: null }),
    );
    o.set(
      uid(6),
      openingValue('door', wallOf(o, uid(1)), pt(72, 0), { hostWallId: uid(99), axis: null }),
    );
    const index = createPickIndex();
    expect(index.floorId).toBeNull();
    expect(index.sync(o, F1, [])).toBe(5);
    expect(index.floorId).toBe(F1);

    expect(index.pick(pt(72, 0), TOL)).toEqual([uid(2), uid(1)]);
    expect(index.pick(pt(20, 0), TOL)).toEqual([uid(1)]);
    expect(index.pick(pt(72, 5), TOL)).toEqual([uid(2), uid(1)]);
    expect(index.pick(pt(72, 7), TOL)).toEqual([]);
    expect(index.pick(pt(72, 100), TOL)).toEqual([uid(3), uid(4)]);
    expect(index.pick(pt(200, 50), TOL)).toEqual([uid(5)]);
    expect(index.has(uid(6))).toBe(false);
    expect(index.pick(pt(Number.NaN, 0), TOL)).toEqual([]);
    expect(index.pick(pt(72, 0), 0)).toEqual([]);
  });

  it('EZD-208a P2 a pick reads only the nearby cells', () => {
    let o = baseObjects();
    for (let i = 0; i < 400; i++) {
      o = withWalls(o, 1 + i, [pt(96 * i + 12, 12), pt(96 * i + 36, 12)], false, 'right');
    }
    const index = createPickIndex();
    index.sync(o, F1, []);
    expect(index.pick(pt(696, 10), TOL)).toEqual([uid(8)]);
    expect(index.lastQueryExamined()).toBe(1);
  });

  it('EZD-208a P3 rooms are empty space', () => {
    const boundary = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)];
    const o = withWalls(baseObjects(), 1, boundary, true, 'right');
    o.set(uid(9), roomValue(boundary, 'Room 1', null));
    const index = createPickIndex();
    index.sync(o, F1, []);
    expect(index.pick(pt(72, 60), TOL)).toEqual([]);
    expect(index.all()).toEqual([uid(2), uid(4), uid(1), uid(3)]);
    expect(index.has(uid(9))).toBe(false);
  });

  it('EZD-208a P4 box modes', () => {
    const index = createPickIndex();
    index.sync(c1WithDoor(), F1, []);
    const east = { minX: 72, minY: -24, maxX: 168, maxY: 24 };
    expect(index.inRect(east, 'inside')).toEqual([]);
    expect(index.inRect(east, 'touch')).toEqual([uid(2), uid(1)]);
    const wide = { minX: -24, minY: -24, maxX: 168, maxY: 24 };
    expect(index.inRect(wide, 'inside')).toEqual([uid(2), uid(1)]);
    const bad = { minX: 5, maxX: 1, minY: 0, maxY: 1 };
    expect(index.inRect(bad, 'inside')).toEqual([]);
    expect(index.inRect(bad, 'touch')).toEqual([]);
  });

  it('EZD-208a P5 sync follows hosts, deletes and floors', () => {
    const first = c1WithDoor();
    const index = createPickIndex();
    index.sync(first, F1, []);

    const next = new Map(first);
    next.set(
      uid(1),
      withWalls(baseObjects(), 1, [pt(0, -6), pt(144, -6)], false, 'center').get(uid(1))!,
    );
    expect(index.sync(next, F1, [uid(1)])).toBe(2);
    expectBody(index.body(uid(2)), [pt(54, -3.75), pt(90, -3.75), pt(90, -8.25), pt(54, -8.25)]);

    const next2 = new Map(next);
    next2.delete(uid(2));
    expect(index.sync(next2, F1, [uid(2)])).toBe(1);
    expect(index.all()).toEqual([uid(1)]);
    expect(index.body(uid(2))).toBeNull();
    expect(index.body(uid(1))).toBeNull();
    expect(index.has(uid(1).toUpperCase())).toBe(true);

    expect(index.sync(next2, F2, [])).toBe(0);
    expect(index.all()).toEqual([]);
    expect(index.floorId).toBe(F2);
  });
});
