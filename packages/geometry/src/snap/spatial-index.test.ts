// EZD-206 · tests S1-S5 (vault/plans/EZD-206.md section 4).
import { describe, expect, it } from 'vitest';
import { ID, wallObj } from '../walls/test-utils/fixtures';
import { createSpatialIndex, type SpatialIndex } from './spatial-index';
import { createWallSnapIndex, wallBounds } from './wall-snap-index';

const r = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

function s1Index(): SpatialIndex {
  const ix = createSpatialIndex();
  ix.upsert('b', r(0, 0, 10, 10));
  ix.upsert('a', r(20, 20, 30, 30));
  ix.upsert('c', r(5, 5, 25, 25));
  return ix;
}

function grid3000() {
  return Array.from({ length: 3000 }, (_, k) => {
    const x = 200 * (k % 50);
    const y = 200 * Math.floor(k / 50);
    return wallObj(`w${String(k).padStart(4, '0')}`, { x, y }, { x: x + 100, y }, { thicknessSide: 'center' });
  });
}

describe('EZD-206 spatial index', () => {
  it('S1 query returns the ids whose bounds meet the rect, sorted', () => {
    const ix = s1Index();
    expect(ix.query(r(8, 8, 22, 22))).toEqual(['a', 'b', 'c']);
    expect(ix.query(r(11, 11, 19, 19))).toEqual(['c']);
    expect(ix.query(r(40, 40, 50, 50))).toEqual([]);
    expect(ix.query(r(30, 30, 40, 40))).toEqual(['a']);
  });

  it('S2 upsert replaces and remove deletes', () => {
    const ix = s1Index();
    ix.upsert('a', r(100, 100, 110, 110));
    expect(ix.query(r(26, 26, 30, 30))).toEqual([]);
    expect(ix.query(r(100, 100, 101, 101))).toEqual(['a']);
    expect(ix.size()).toBe(3);
    expect(ix.remove('b')).toBe(true);
    expect(ix.remove('b')).toBe(false);
    expect(ix.query(r(0, 0, 4, 4))).toEqual([]);
    expect(ix.size()).toBe(2);
  });

  it('S3 bad input is refused', () => {
    expect(() => createSpatialIndex(0)).toThrow(RangeError);
    expect(() => createSpatialIndex(-1)).toThrow(RangeError);
    expect(() => createSpatialIndex(NaN)).toThrow(RangeError);
    const ix = s1Index();
    expect(() => ix.upsert('x', r(NaN, 0, 1, 1))).toThrow(RangeError);
    expect(() => ix.upsert('x', r(5, 0, 1, 1))).toThrow(RangeError);
    expect(ix.size()).toBe(3);
    expect(ix.query(r(0, 0, NaN, 1))).toEqual([]);
    expect(ix.lastQueryExamined()).toBe(0);
  });

  it('S4 a query examines only nearby entries', () => {
    const wix = createWallSnapIndex(grid3000());
    expect(wix.spatial.query(r(40, -7, 60, 13))).toEqual(['w0000']);
    expect(wix.spatial.lastQueryExamined()).toBe(1);
    expect(wix.spatial.query(r(-1e7, -1e7, 1e7, 1e7))).toHaveLength(3000);
    expect(wix.spatial.lastQueryExamined()).toBe(3000);
  });

  it('S5 the wall index keeps bounds current for hover', () => {
    const right = wallObj(ID.W1, { x: 0, y: 0 }, { x: 120, y: 0 }, { thicknessSide: 'right' });
    expect(wallBounds(right.data)).toEqual({ minX: 0, minY: -4.5, maxX: 120, maxY: 0 });
    const c = wallObj(ID.W1, { x: 0, y: 0 }, { x: 120, y: 0 }, { thicknessSide: 'center' });
    const moved = wallObj(ID.W1, { x: 0, y: 50 }, { x: 120, y: 50 }, { thicknessSide: 'center' });
    const wix = createWallSnapIndex([c]);
    wix.upsertWall(moved);
    expect(wix.spatial.query(r(-1, -1, 1, 1))).toEqual([]);
    expect(wix.spatial.query(r(-1, 49, 1, 51))).toEqual([ID.W1]);
    expect(wix.getWall(ID.W1)).toEqual(moved);
    expect(wix.removeWall(ID.W1)).toBe(true);
    expect(wix.removeWall(ID.W1)).toBe(false);
    expect(wix.spatial.query(r(-1, 49, 1, 51))).toEqual([]);
  });
});
