// EZD-208a S1-S4 (vault/plans/EZD-208a.md section 4; section 1 R2, R7; section 3 G1-G6; AC-EZD-208-11, -12, -18).
// Expected values: the plan's rows (R2: wall 144 x 4.5, door 36 x 4.5; EZD-204b "Flagged opening"), never the code.
import { describe, expect, it } from 'vitest';
import { createOpeningData, type OpeningObject } from '../openings/opening';
import type { Point } from '../schema';
import type { Rect } from '../snap/spatial-index';
import { ID, wallObj } from '../walls/test-utils/fixtures';
import type { WallObject } from '../walls/wall';
import {
  openingPickShape,
  shapeBounds,
  shapeDistance,
  shapeInRect,
  shapeTouchesRect,
  wallPickShape,
  type PickShape,
} from './shapes';

const pt = (x: number, y: number): Point => ({ x, y });
const WALL = wallObj(ID.W1, pt(0, 0), pt(144, 0), { thicknessSide: 'center' });

function doorAt(center: Point, host: WallObject = WALL): OpeningObject {
  return {
    id: ID.D1,
    type: 'opening',
    data: createOpeningData({ kind: 'door', host, center }),
  };
}

function flaggedWindow(center: Point, axis: Point | null): OpeningObject {
  const made = createOpeningData({ kind: 'window', host: WALL, center });
  return {
    id: ID.N1,
    type: 'opening',
    data: { ...made, geometry: { center, hostWallId: null, axis } },
  };
}

function quadPoints(s: PickShape | null): readonly Point[] {
  if (s === null || s.kind !== 'quad') throw new Error('expected a quad shape');
  return s.points;
}

function expectPoints(got: readonly Point[], want: readonly Point[]): void {
  expect(got).toHaveLength(want.length);
  want.forEach((w, i) => {
    expect(got[i]!.x).toBeCloseTo(w.x, 9);
    expect(got[i]!.y).toBeCloseTo(w.y, 9);
  });
}

describe('EZD-208a pick shapes', () => {
  it('EZD-208a S1 wall and door shapes', () => {
    const wall = wallPickShape(WALL);
    expect(wall).not.toBeNull();
    expect(wall!.kind).toBe('quad');
    expectPoints(quadPoints(wall), [pt(0, 2.25), pt(144, 2.25), pt(144, -2.25), pt(0, -2.25)]);
    expect(wall!.area).toBeCloseTo(648, 9);

    const door = openingPickShape(doorAt(pt(72, 0)), WALL);
    expect(door).not.toBeNull();
    expect(door!.kind).toBe('quad');
    expectPoints(quadPoints(door), [pt(54, 2.25), pt(90, 2.25), pt(90, -2.25), pt(54, -2.25)]);
    expect(door!.area).toBeCloseTo(162, 9);

    expect(shapeDistance(door!, pt(72, 0))).toBeCloseTo(0, 9);
    expect(shapeDistance(door!, pt(100, 0))).toBeCloseTo(10, 9);
    expect(shapeDistance(wall!, pt(72, 10))).toBeCloseTo(7.75, 9);
    expect(shapeDistance(wall!, pt(Number.NaN, 0))).toBe(Infinity);
    expect(shapeDistance(wall!, pt(0, Number.POSITIVE_INFINITY))).toBe(Infinity);

    const b = shapeBounds(door!);
    expect(b.minX).toBeCloseTo(54, 9);
    expect(b.minY).toBeCloseTo(-2.25, 9);
    expect(b.maxX).toBeCloseTo(90, 9);
    expect(b.maxY).toBeCloseTo(2.25, 9);
  });

  it('EZD-208a S2 a flagged opening is a bar', () => {
    const flat = openingPickShape(flaggedWindow(pt(10, 10), null), null);
    if (flat === null || flat.kind !== 'bar') throw new Error('expected a bar shape');
    expectPoints([flat.from, flat.to], [pt(-8, 10), pt(28, 10)]);
    expect(flat.area).toBe(0);
    expect(shapeDistance(flat, pt(0, 10))).toBeCloseTo(0, 9);
    expect(shapeDistance(flat, pt(0, 15))).toBeCloseTo(5, 9);

    // A host given for a flagged opening is ignored.
    const ignored = openingPickShape(flaggedWindow(pt(10, 10), null), WALL);
    expect(ignored).toEqual(flat);

    const tall = openingPickShape(flaggedWindow(pt(10, 10), pt(0, 1)), null);
    if (tall === null || tall.kind !== 'bar') throw new Error('expected a bar shape');
    expectPoints([tall.from, tall.to], [pt(10, -8), pt(10, 28)]);
    expect(tall.area).toBe(0);
  });

  it('EZD-208a S3 inside and touch', () => {
    const quad: PickShape = {
      kind: 'quad',
      points: [pt(0, 0), pt(10, 0), pt(10, 5), pt(0, 5)],
      area: 50,
    };
    const r = (minX: number, minY: number, maxX: number, maxY: number): Rect => ({
      minX,
      minY,
      maxX,
      maxY,
    });
    const rects: Array<[Rect, boolean, boolean]> = [
      [r(-1, -1, 11, 6), true, true],
      [r(5, -1, 20, 20), false, true],
      [r(2, -1, 4, 6), false, true],
      [r(10, 5, 12, 7), false, true],
      [r(0, 0, 10, 5), true, true],
      [r(20, 20, 30, 30), false, false],
      [{ minX: 5, maxX: 1, minY: 0, maxY: 1 }, false, false],
      [{ minX: Number.NaN, minY: -1, maxX: 11, maxY: 6 }, false, false],
    ];
    rects.forEach(([rect, inside, touch], i) => {
      expect(shapeInRect(quad, rect), `inside ${i}`).toBe(inside);
      expect(shapeTouchesRect(quad, rect), `touch ${i}`).toBe(touch);
    });
  });

  it('EZD-208a S4 shapes that are not drawn', () => {
    expect(openingPickShape(doorAt(pt(200, 0)), WALL)).toBeNull();
    expect(openingPickShape(doorAt(pt(162, 0)), WALL)).toBeNull();
    const edge = openingPickShape(doorAt(pt(160, 0)), WALL);
    expect(edge).not.toBeNull();
    expect(edge!.area).toBeCloseTo(9, 9);
    const xs = quadPoints(edge).map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(142, 9);
    expect(Math.max(...xs)).toBeCloseTo(144, 9);

    expect(openingPickShape(doorAt(pt(72, 0)), null)).toBeNull();

    const tiny: WallObject = {
      ...WALL,
      data: { ...WALL.data, geometry: { start: pt(0, 0), end: pt(0.01, 0) } },
    };
    expect(wallPickShape(tiny)).toBeNull();
    expect(openingPickShape(doorAt(pt(72, 0)), tiny)).toBeNull();
  });
});
