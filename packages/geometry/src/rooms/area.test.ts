// EZD-205a · T1 to T4: room area, inside point and boundary compare (vault/plans/EZD-205a.md section 1 Decided
// "Area", "pointInRing", "interiorPoint", "sameBoundary", "Empty and degenerate input"; section 4; AC-EZD-205-1).
// Expected values: 09j Room area rows 1-6; Q-0568 (halves up); 03g rows 2-3 (1/64" inclusive).
import { describe, expect, it } from 'vitest';
import type { Point } from '../schema';
import {
  interiorPoint,
  outlineAreaSqIn,
  pointInRing,
  ringSignedAreaSqIn,
  roomAreaSqFt,
  sameBoundary,
} from './area';

const P = (x: number, y: number): Point => ({ x, y });
const R = (w: number, d: number): Point[] => [P(0, 0), P(w, 0), P(w, d), P(0, d)];

function expectPt(got: Point, x: number, y: number): void {
  expect(got.x).toBeCloseTo(x, 9);
  expect(got.y).toBeCloseTo(y, 9);
}

const L_SHAPE = [P(0, 0), P(144, 0), P(144, 84), P(96, 84), P(96, 120), P(0, 120)];
const U_SHAPE = [
  P(0, 0),
  P(144, 0),
  P(144, 120),
  P(96, 120),
  P(96, 24),
  P(48, 24),
  P(48, 120),
  P(0, 120),
];

describe('EZD-205a room area', () => {
  it('EZD-205a T1 area rows: whole square feet from the outline', () => {
    expect(roomAreaSqFt(R(144, 120))).toBe(120);
    expect(roomAreaSqFt(R(150, 120))).toBe(125);
    expect(roomAreaSqFt(R(141.5, 168))).toBe(165);
    expect(roomAreaSqFt(R(147, 120))).toBe(123);
    expect(roomAreaSqFt(R(2400, 2400))).toBe(40000);
    expect(roomAreaSqFt(R(6, 6))).toBe(0);
    expect(outlineAreaSqIn(R(141.5, 168))).toBeCloseTo(23772, 6);
  });

  it('EZD-205a T2 half up, orientation, empty', () => {
    expect(outlineAreaSqIn(R(146.9375, 120))).toBeCloseTo(17632.5, 6);
    expect(roomAreaSqFt(R(146.9375, 120))).toBe(122);
    expect(roomAreaSqFt([...R(147, 120)].reverse())).toBe(123);
    expect(roomAreaSqFt([P(0, 0), P(1, 0)])).toBe(0);
    expect(ringSignedAreaSqIn([])).toBe(0);
    expect(outlineAreaSqIn([])).toBe(0);
    expect(roomAreaSqFt([])).toBe(0);
    expect(ringSignedAreaSqIn(R(144, 120))).toBeCloseTo(17280, 6);
    expect(ringSignedAreaSqIn([...R(144, 120)].reverse())).toBeCloseTo(-17280, 6);

    // Calc-auditor (in-place): 147" x 120" = 17,640 sq in = 122.5 SF, halves go up to 123 (09j Room area row 4;
    // Q-0568) also when the corners are rotated, so floating-point noise in the shoelace sum cannot round it down.
    const rotated = (deg: number, about: Point): Point[] => {
      const a = (deg * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return R(147, 120).map((p) => ({
        x: about.x + (p.x - about.x) * c - (p.y - about.y) * s,
        y: about.y + (p.x - about.x) * s + (p.y - about.y) * c,
      }));
    };
    expect(roomAreaSqFt(rotated(18, P(0, 0))), '18 deg about the origin').toBe(123);
    expect(roomAreaSqFt(rotated(18, P(37.3, 11.1))), '18 deg about (37.3, 11.1)').toBe(123);
    for (let deg = 1; deg <= 89; deg++) {
      expect(roomAreaSqFt(rotated(deg, P(0, 0))), `${deg} deg about the origin`).toBe(123);
    }
  });

  it('EZD-205a T3 inside point', () => {
    expectPt(interiorPoint(R(144, 120)), 72, 60);
    expectPt(interiorPoint(L_SHAPE), 200 / 3, 166 / 3);
    expectPt(interiorPoint(U_SHAPE), 24, 612 / 11);
    expectPt(interiorPoint([P(0, 0), P(10, 0), P(20, 0)]), 10, 0);
    expectPt(interiorPoint([]), 0, 0);
    expect(pointInRing(P(72, 60), R(144, 120))).toBe(true);
    expect(pointInRing(P(150, 60), R(144, 120))).toBe(false);
    expect(pointInRing(P(0, 0), [])).toBe(false);
  });

  it('EZD-205a T4 same boundary', () => {
    const r = R(144, 120);
    expect(sameBoundary(r, [P(144, 0), P(144, 120), P(0, 120), P(0, 0)])).toBe(true);
    expect(sameBoundary(r, [...r].reverse())).toBe(true);
    expect(sameBoundary(r, [P(0, 0), P(144.015625, 0), P(144, 120), P(0, 120)])).toBe(true);
    expect(sameBoundary(r, [P(0, 0), P(144.0157, 0), P(144, 120), P(0, 120)])).toBe(false);
    expect(sameBoundary(r, r.slice(0, 3))).toBe(false);
    expect(sameBoundary([], [])).toBe(true);
    expect(sameBoundary([], r)).toBe(false);
  });
});

// EZD-235 A1 (vault/plans/EZD-235.md section 4; D-Label). The middle dot is written as its escape (L-042).
import { formatRoomLabel } from './area';

describe('EZD-235 formatRoomLabel', () => {
  it('EZD-235 A1 formatRoomLabel: capitals, middle dot, comma groups, and only whole areas of 0 or more', () => {
    expect(formatRoomLabel('Kitchen', 40000)).toBe('KITCHEN \u00b7 40,000 SF');
    expect(formatRoomLabel('bath', 0)).toBe('BATH \u00b7 0 SF');
    expect(formatRoomLabel('Den', 1234567)).toBe('DEN \u00b7 1,234,567 SF');
    expect(formatRoomLabel('Room 2', 73)).toBe('ROOM 2 \u00b7 73 SF');
    expect(formatRoomLabel('', 120)).toBe(' \u00b7 120 SF');
    for (const bad of [-1, 1.5, NaN, Infinity, 2 ** 53]) {
      expect(() => formatRoomLabel('A', bad)).toThrow(RangeError);
      expect(() => formatRoomLabel('A', bad)).toThrow('room_area');
    }
  });
});
