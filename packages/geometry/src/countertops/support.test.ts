// EZD-415 (AC-EZD-415-1 "A 76 1/2" side at 12" with a 10" limit and 24" bracket spacing and 24" seat width shows the
// notice with 4 brackets and 3 seats"; S04b Support notice "Shown when seating overhang exceeds limit"; S15d
// "Seating overhang support limit | Overhang beyond this adds support brackets ... Empty = support check off").
// Hand counts: the board island top is 76 1/2 wide (cabinets 73 1/2 + 1 1/2 each end). Brackets one per 24" bay or
// part of one: 76.5 / 24 = 3.19 → 4. Seats whole 24" widths: 76.5 / 24 = 3.19 → 3. A 72" side: 72 / 24 = 3 exactly
// → 3 brackets and 3 seats; 72 1/16" → 4 brackets, 3 seats.
import { describe, expect, it } from 'vitest';
import type { CountertopEdge, CountertopPieceData, Point } from '../schema';
import { countertopPieceDataSchema } from '../schema/countertop';
import {
  countertopBracketCount,
  countertopSeatCount,
  countertopSeatingSides,
  countertopSupportRequirement,
  sameCountertopSupport,
} from './support';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const SEAM = 'e0000000-0000-4000-8000-000000000001';
const exposed: CountertopEdge = { kind: 'exposed', overhang: 1.5, backsplashHeight: null, profileId: null };
const seating = (overhang: number): CountertopEdge => ({
  kind: 'seating',
  overhang,
  backsplashHeight: null,
  profileId: null,
});
// The board island at the back 12": x −1.5..75 (76 1/2), y −12..25.5.
const islandPts = (w = 76.5): Point[] => [
  { x: -1.5, y: -12 },
  { x: -1.5 + w, y: -12 },
  { x: -1.5 + w, y: 25.5 },
  { x: -1.5, y: 25.5 },
];
const piece = (edges: CountertopEdge[], outline = islandPts()): CountertopPieceData => ({
  geometry: { outline },
  status: 'new',
  level: LEVEL,
  attributes: { label: 'C', name: 'Island', materialItemId: null, thickness: 3 / 2.54, edges },
});
const AC = { limit: 10, bracketSpacing: 24, seatWidth: 24 };

describe('EZD-415 seating support check', () => {
  it('AC-EZD-415-1: a 76 1/2" side at 12" with a 10" limit, 24" spacing and 24" seats needs 4 brackets, 3 seats', () => {
    const p = piece([seating(12), exposed, exposed, exposed]);
    expect(countertopSeatingSides(p, AC)).toEqual([
      { edge: 0, length: 76.5, overhang: 12, needsSupport: true, brackets: 4, seats: 3 },
    ]);
    expect(countertopSupportRequirement(p, AC)).toEqual({ overhang: 12, brackets: 4, spacing: 24 });
  });

  it('counts brackets one per spacing or part of it, seats in whole widths', () => {
    expect(countertopBracketCount(76.5, 24)).toBe(4);
    expect(countertopBracketCount(72, 24)).toBe(3);
    expect(countertopBracketCount(72 + 1e-9, 24)).toBe(3);
    expect(countertopBracketCount(72.0625, 24)).toBe(4);
    expect(countertopBracketCount(10, 24)).toBe(1);
    expect(countertopBracketCount(0, 24)).toBe(0);
    expect(countertopSeatCount(76.5, 24)).toBe(3);
    expect(countertopSeatCount(72 - 1e-9, 24)).toBe(3);
    expect(countertopSeatCount(71.9375, 24)).toBe(2);
    expect(countertopSeatCount(20, 24)).toBe(0);
  });

  it('an overhang equal to the limit needs no support ("beyond", "exceeds")', () => {
    const p = piece([seating(10), exposed, exposed, exposed]);
    expect(countertopSeatingSides(p, AC)).toEqual([
      { edge: 0, length: 76.5, overhang: 10, needsSupport: false, brackets: null, seats: 3 },
    ]);
    expect(countertopSupportRequirement(p, AC)).toBeNull();
  });

  it('the limit Not set turns the check off; seats still count', () => {
    const p = piece([seating(12), exposed, exposed, exposed]);
    expect(countertopSupportRequirement(p, { ...AC, limit: null })).toBeNull();
    expect(countertopSeatingSides(p, { ...AC, limit: null })[0]).toMatchObject({ needsSupport: false, seats: 3 });
  });

  it('spacing or seat width Not set leaves that count unknown', () => {
    const p = piece([seating(12), exposed, exposed, exposed]);
    const s = { limit: 10, bracketSpacing: null, seatWidth: null };
    expect(countertopSeatingSides(p, s)[0]).toMatchObject({ needsSupport: true, brackets: null, seats: null });
    expect(countertopSupportRequirement(p, s)).toEqual({ overhang: 12, brackets: null, spacing: null });
  });

  it('only seating edges count; exposed, wall and seam edges never need support', () => {
    const deep: CountertopEdge = { kind: 'exposed', overhang: 1.5, backsplashHeight: null, profileId: null };
    const seam: CountertopEdge = { kind: 'wall', overhang: 0, backsplashHeight: null, profileId: null, seamId: SEAM };
    const p = piece([deep, seam, exposed, exposed]);
    expect(countertopSeatingSides(p, AC)).toEqual([]);
    expect(countertopSupportRequirement(p, AC)).toBeNull();
  });

  it('two seating sides past the limit add their brackets; the deepest overhang is kept', () => {
    // Sides 1 and 3 are the 37 1/2" ends: ceil(37.5 / 24) = 2 each; side 0 at 12" is 4.
    const p = piece([seating(12), seating(11), exposed, seating(9)]);
    const sides = countertopSeatingSides(p, AC);
    expect(sides.map((s) => [s.edge, s.length, s.needsSupport, s.brackets, s.seats])).toEqual([
      [0, 76.5, true, 4, 3],
      [1, 37.5, true, 2, 1],
      [3, 37.5, false, null, 1],
    ]);
    expect(countertopSupportRequirement(p, AC)).toEqual({ overhang: 12, brackets: 6, spacing: 24 });
  });

  it('the piece schema stores the requirement, and pieces saved without it still read', () => {
    const p = piece([seating(12), exposed, exposed, exposed]);
    expect(countertopPieceDataSchema.safeParse(p).success).toBe(true);
    const withSupport = { ...p, attributes: { ...p.attributes, support: { overhang: 12, brackets: 4, spacing: 24 } } };
    expect(countertopPieceDataSchema.safeParse(withSupport).success).toBe(true);
    const unknownCount = { ...p, attributes: { ...p.attributes, support: { overhang: 12, brackets: null, spacing: null } } };
    expect(countertopPieceDataSchema.safeParse(unknownCount).success).toBe(true);
    const none = { ...p, attributes: { ...p.attributes, support: null } };
    expect(countertopPieceDataSchema.safeParse(none).success).toBe(true);
    for (const bad of [
      { overhang: 12, brackets: 4, spacing: null },
      { overhang: 12, brackets: 0, spacing: 24 },
      { overhang: 12, brackets: 2.5, spacing: 24 },
      { overhang: 0, brackets: 4, spacing: 24 },
    ]) {
      expect(countertopPieceDataSchema.safeParse({ ...p, attributes: { ...p.attributes, support: bad } }).success).toBe(
        false,
      );
    }
  });

  it('compares requirements, absent and null both meaning none', () => {
    expect(sameCountertopSupport(undefined, null)).toBe(true);
    expect(sameCountertopSupport(null, { overhang: 12, brackets: 4, spacing: 24 })).toBe(false);
    expect(
      sameCountertopSupport({ overhang: 12, brackets: 4, spacing: 24 }, { overhang: 12, brackets: 4, spacing: 24 }),
    ).toBe(true);
    expect(
      sameCountertopSupport({ overhang: 12, brackets: 4, spacing: 24 }, { overhang: 12, brackets: 5, spacing: 24 }),
    ).toBe(false);
  });
});
