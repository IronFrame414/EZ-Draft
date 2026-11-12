// EZD-205a · T5 to T10: room outlines from the walls' inside finished faces (vault/plans/EZD-205a.md section 1
// Decided "Outline graph", "Faces", "Face line", "Ring vertices", "Room rings", "Walls not dividing a room",
// "Outline order", "wallIds"; section 4; AC-EZD-205-1, AC-EZD-205-5). Expected values: 09j rows 3, 4, 7-10;
// Q-0559; Q-0569 (b); Q-0570; Q-0598 (a); Q-0612 (a) (QP-1).
import { describe, expect, it } from 'vitest';
import type { Point } from '../schema';
import { outlineAreaSqIn, roomAreaSqFt } from './area';
import { findRoomOutlines, type RoomOutline } from './outlines';
import { chain, F1, F2, FA, uid, wallObj } from './test-utils/fixtures';

const P = (x: number, y: number): Point => ({ x, y });
const R = (w: number, d: number): Point[] => [P(0, 0), P(w, 0), P(w, d), P(0, d)];

const L_SHAPE = [P(0, 0), P(144, 0), P(144, 84), P(96, 84), P(96, 120), P(0, 120)];
const TRIANGLE = [P(0, 0), P(144, 0), P(0, 120)];

function expectBoundary(got: Point[], want: Point[]): void {
  expect(got).toHaveLength(want.length);
  want.forEach((p, k) => {
    expect(got[k]!.x, `point ${k} x`).toBeCloseTo(p.x, 9);
    expect(got[k]!.y, `point ${k} y`).toBeCloseTo(p.y, 9);
  });
}
const hasPoint = (ring: Point[], x: number, y: number) =>
  ring.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);
const maxX = (o: RoomOutline) => Math.max(...o.boundary.map((p) => p.x));
const minX = (o: RoomOutline) => Math.min(...o.boundary.map((p) => p.x));

describe('EZD-205a room outlines', () => {
  it('EZD-205a T5 done when: a closed chain of walls makes one room on the inside finished faces', () => {
    const cases: [string, Point[], number][] = [
      ['R(141.5,168)', R(141.5, 168), 165],
      ['R(147,120)', R(147, 120), 123],
      ['L', L_SHAPE, 108],
      ['triangle', TRIANGLE, 60],
    ];
    for (const [name, pts, sf] of cases) {
      const outlines = findRoomOutlines(chain(1, pts, 'right'), F1);
      expect(outlines, name).toHaveLength(1);
      expect(roomAreaSqFt(outlines[0]!.boundary), name).toBe(sf);
    }
    const [kitchen] = findRoomOutlines(chain(1, R(141.5, 168), 'right'), F1);
    expectBoundary(kitchen!.boundary, [P(0, 0), P(141.5, 0), P(141.5, 168), P(0, 168)]);
    expect(kitchen!.wallIds).toEqual([uid(1), uid(2), uid(3), uid(4)]);
  });

  it('EZD-205a T6 face offsets: the room is on the face away from the thickness', () => {
    const cw = [...R(144, 120)].reverse();
    const cwLeft = findRoomOutlines(chain(1, cw, 'left'), F1);
    expect(cwLeft).toHaveLength(1);
    expect(roomAreaSqFt(cwLeft[0]!.boundary)).toBe(120);
    expectBoundary(cwLeft[0]!.boundary, R(144, 120));

    const ccwLeft = findRoomOutlines(chain(1, R(144, 120), 'left'), F1);
    expect(ccwLeft).toHaveLength(1);
    expect(outlineAreaSqIn(ccwLeft[0]!.boundary)).toBeCloseTo(14985, 6);
    expect(roomAreaSqFt(ccwLeft[0]!.boundary)).toBe(104);

    const ccwCenter = findRoomOutlines(chain(1, R(144, 120), 'center'), F1);
    expect(ccwCenter).toHaveLength(1);
    expect(outlineAreaSqIn(ccwCenter[0]!.boundary)).toBeCloseTo(16112.25, 6);
    expect(roomAreaSqFt(ccwCenter[0]!.boundary)).toBe(112);
  });

  it('EZD-205a T7 done when: partition: a dividing wall splits one room into two on its finished faces', () => {
    const pId = uid(5);
    for (const [name, from, to] of [
      ['drawn south to north', P(60, 0), P(60, 120)],
      ['drawn north to south', P(60, 120), P(60, 0)],
    ] as const) {
      const walls = [...chain(1, R(144, 120), 'right'), wallObj(pId, from, to, 'center')];
      const outlines = findRoomOutlines(walls, F1);
      expect(outlines, name).toHaveLength(2);
      expectBoundary(outlines[0]!.boundary, [P(0, 0), P(57.75, 0), P(57.75, 120), P(0, 120)]);
      expect(roomAreaSqFt(outlines[0]!.boundary), name).toBe(48);
      expectBoundary(outlines[1]!.boundary, [P(62.25, 0), P(144, 0), P(144, 120), P(62.25, 120)]);
      expect(roomAreaSqFt(outlines[1]!.boundary), name).toBe(68);
      expect(outlines[0]!.wallIds, name).toEqual([uid(1), uid(3), uid(4), pId]);
    }
  });

  it('EZD-205a T8 crossing: a wall crossing two walls splits the room', () => {
    const walls = [
      ...chain(1, R(144, 120), 'right'),
      wallObj(uid(5), P(72, -24), P(72, 144), 'center'),
    ];
    const outlines = findRoomOutlines(walls, F1);
    expect(outlines).toHaveLength(2);
    for (const o of outlines) {
      expect(outlineAreaSqIn(o.boundary)).toBeCloseTo(8370, 6);
      expect(roomAreaSqFt(o.boundary)).toBe(58);
    }
    expect(maxX(outlines[0]!)).toBeCloseTo(69.75, 9);
    expect(minX(outlines[1]!)).toBeCloseTo(74.25, 9);
  });

  it('EZD-205a T9 stub, island: walls that do not divide a room are cut out of its area', () => {
    const stub = findRoomOutlines(
      [...chain(1, R(144, 120), 'right'), wallObj(uid(5), P(72, 0), P(72, 36), 'center')],
      F1,
    );
    expect(stub).toHaveLength(1);
    expect(outlineAreaSqIn(stub[0]!.boundary)).toBeCloseTo(17118, 6);
    expect(roomAreaSqFt(stub[0]!.boundary)).toBe(119);
    expect(stub[0]!.boundary).toHaveLength(8);
    expect(hasPoint(stub[0]!.boundary, 69.75, 36)).toBe(true);
    expect(hasPoint(stub[0]!.boundary, 74.25, 36)).toBe(true);

    const walls = [
      ...chain(1, R(144, 120), 'right'),
      ...chain(5, [P(48, 36), P(96, 36), P(96, 84), P(48, 84)], 'right'),
    ];
    const island = findRoomOutlines(walls, F1);
    expect(island).toHaveLength(2);
    const box = island.find((o) => roomAreaSqFt(o.boundary) === 16);
    const outer = island.find((o) => roomAreaSqFt(o.boundary) === 97);
    expect(box).toBeDefined();
    expect(outer).toBeDefined();
    expect(outlineAreaSqIn(box!.boundary)).toBeCloseTo(2304, 6);
    expect(outlineAreaSqIn(outer!.boundary)).toBeCloseTo(14031, 6);
    expectBoundary(outer!.boundary, [
      P(0, 0),
      P(144, 0),
      P(144, 31.5),
      P(100.5, 31.5),
      P(43.5, 31.5),
      P(43.5, 88.5),
      P(100.5, 88.5),
      P(100.5, 31.5),
      P(144, 31.5),
      P(144, 120),
      P(0, 120),
    ]);
    expect(outer!.wallIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(uid));
  });

  it('EZD-205a T10 no room, level: no closed chain gives no outline; the level compare ignores case', () => {
    const rect = chain(1, R(144, 120), 'right');
    const one = wallObj(uid(1), P(0, 0), P(144, 0));
    const zero = { ...one, data: { ...one.data, geometry: { start: P(0, 0), end: P(0, 0) } } };
    expect(findRoomOutlines([], F1)).toEqual([]);
    expect(findRoomOutlines([one], F1)).toEqual([]);
    expect(findRoomOutlines(rect.slice(0, 3), F1)).toEqual([]);
    expect(findRoomOutlines([zero], F1)).toEqual([]);
    expect(findRoomOutlines(chain(1, R(144, 120), 'right', F2), F1)).toEqual([]);

    const upper = findRoomOutlines(chain(1, R(144, 120), 'right', FA), FA.toUpperCase());
    expect(upper).toHaveLength(1);
    expect(roomAreaSqFt(upper[0]!.boundary)).toBe(120);
  });
});
