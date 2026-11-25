// EZD-413 (S04b Controls "Cutout | Place a sink or cooktop cutout"; phase-04 EZD-413 "a typed W × D (default from
// the fixture under them)"; AC-EZD-413-2 "a typed 30" × 16" cutout draws at that size"; 09f "Area per piece";
// vault/build/assumptions.md EZD-413). Hand counts on a straight top 144 x 25 1/2 (front y = 0): a 30 x 16 cutout
// centred at (60, 12) has corners x 45 to 75, y 4 to 20. Its area stays 144 x 25 1/2 / 144 = 25.5 sq ft.
import { describe, expect, it } from 'vitest';
import type { CountertopCutout, CountertopPieceData, ModelObject, Point } from '../schema';
import {
  COUNTERTOP_CUTOUT_DEFAULT_SIZE,
  cutoutAxisAt,
  cutoutCorners,
  cutoutFitsPiece,
  cutoutFixtureAt,
  cutoutFromFixture,
  placeCountertopCutout,
  resizeCountertopCutout,
} from './cutout';
import { countertopExposedEdgeIn, countertopPieceAreaSqFt } from './piece';
import { moveCountertopVertex } from './outline';

const CUT = '33333333-3333-4333-8333-333333333333';
const SINK = '44444444-4444-4444-8444-444444444444';
const DW = '55555555-5555-4555-8555-555555555555';

const top = (): CountertopPieceData => ({
  geometry: {
    outline: [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 25.5 },
      { x: 0, y: 25.5 },
    ],
  },
  status: 'new',
  level: 'f1',
  attributes: {
    label: 'A',
    name: '',
    materialItemId: null,
    thickness: 1.1811,
    edges: [0, 1, 2, 3].map(() => ({
      kind: 'exposed' as const,
      overhang: 1.5,
      backsplashHeight: null,
      profileId: null,
    })),
  },
});

const cut = (center: Point, width = 30, depth = 16): CountertopCutout => ({
  id: CUT,
  kind: 'sink',
  center,
  axis: { x: 1, y: 0 },
  width,
  depth,
  fixtureId: null,
});

const span = (ps: Point[]) => {
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

describe('EZD-413 a cutout is its typed W × D (AC-EZD-413-2)', () => {
  it('a 30 x 16 cutout at (60, 12) has corners at x 45 to 75 and y 4 to 20', () => {
    expect(cutoutCorners(cut({ x: 60, y: 12 }))).toEqual([
      { x: 45, y: 4 },
      { x: 75, y: 4 },
      { x: 75, y: 20 },
      { x: 45, y: 20 },
    ]);
  });

  it('turned to run along a side going up, the 30" width runs up and the 16" depth across', () => {
    const c = { ...cut({ x: 12, y: 60 }), axis: { x: 0, y: 1 } };
    const s = span(cutoutCorners(c));
    expect(s[0]).toBeCloseTo(16, 9);
    expect(s[1]).toBeCloseTo(30, 9);
  });

  it('placing it adds it to the piece; area and exposed edge do not change', () => {
    const before = top();
    const after = placeCountertopCutout(before, cut({ x: 60, y: 12 }));
    if (after === null) throw new Error('refused');
    expect(after.attributes.cutouts).toEqual([cut({ x: 60, y: 12 })]);
    expect(countertopPieceAreaSqFt(after)).toBeCloseTo(25.5, 9);
    expect(countertopExposedEdgeIn(after)).toBeCloseTo(countertopExposedEdgeIn(before), 9);
  });

  it('a cutout past the edge of the top is refused', () => {
    expect(placeCountertopCutout(top(), cut({ x: 10, y: 12 }))).toBeNull(); // x from -5
    expect(placeCountertopCutout(top(), cut({ x: 60, y: 20 }))).toBeNull(); // y to 28
    expect(cutoutFitsPiece(top().geometry.outline, cut({ x: 15, y: 12 }))).toBe(true); // x from 0
  });

  it('typing 30 x 16 over a 25 x 18 cutout sets that size about its center; too deep is refused', () => {
    const placed = placeCountertopCutout(top(), cut({ x: 60, y: 12 }, 25, 18));
    if (placed === null) throw new Error('refused');
    const typed = resizeCountertopCutout(placed, CUT, 30, 16);
    if (typed === null) throw new Error('refused');
    const c = typed.attributes.cutouts![0]!;
    expect([c.width, c.depth]).toEqual([30, 16]);
    expect(span(cutoutCorners(c))).toEqual([30, 16]);
    expect(c.center).toEqual({ x: 60, y: 12 });
    expect(resizeCountertopCutout(placed, CUT, 30, 26)).toBeNull();
    expect(resizeCountertopCutout(placed, SINK, 30, 16)).toBeNull();
  });

  it('a bare top takes the sink and cooktop starting sizes until one is typed', () => {
    expect(COUNTERTOP_CUTOUT_DEFAULT_SIZE.sink).toEqual({ width: 30, depth: 16 });
    expect(COUNTERTOP_CUTOUT_DEFAULT_SIZE.cooktop).toEqual({ width: 30, depth: 21 });
  });
});

describe('EZD-413 a cutout over a sink or cooktop takes its size', () => {
  const fixture = (id: string, kind: 'sink' | 'dishwasher', center: Point): ModelObject => ({
    id,
    type: 'fixture',
    data: {
      geometry: { center, axis: { x: 1, y: 0 } },
      status: 'new',
      level: 'f1',
      attributes: { kind, width: 33, depth: 22 },
    },
  });
  const objects = [fixture(SINK, 'sink', { x: 90, y: 12 }), fixture(DW, 'dishwasher', { x: 40, y: 12 })];

  it('finds the sink under the click and not a dishwasher', () => {
    expect(cutoutFixtureAt(objects, 'F1', { x: 95, y: 15 })?.id).toBe(SINK);
    expect(cutoutFixtureAt(objects, 'f1', { x: 40, y: 12 })).toBeNull();
    expect(cutoutFixtureAt(objects, 'f1', { x: 130, y: 12 })).toBeNull();
    expect(cutoutFixtureAt(objects, 'f2', { x: 95, y: 15 })).toBeNull();
  });

  it('the cutout is the sink 33 x 22 at its center, linked to it', () => {
    const f = cutoutFixtureAt(objects, 'f1', { x: 95, y: 15 });
    if (f === null) throw new Error('none');
    expect(cutoutFromFixture(CUT, f)).toEqual({
      id: CUT,
      kind: 'sink',
      center: { x: 90, y: 12 },
      axis: { x: 1, y: 0 },
      width: 33,
      depth: 22,
      fixtureId: SINK,
    });
  });

  it('on a bare top the width runs along the nearest side', () => {
    expect(cutoutAxisAt(top().geometry.outline, { x: 60, y: 5 })).toEqual({ x: 1, y: 0 });
    expect(cutoutAxisAt(top().geometry.outline, { x: 60, y: 22 })).toEqual({ x: 1, y: 0 });
    expect(cutoutAxisAt(top().geometry.outline, { x: 2, y: 12 })).toEqual({ x: 0, y: 1 });
  });
});

// EZD-413 review: a corner drag (EZD-412) may not leave a cutout off its top. The 30 x 16 cutout at (60, 12) runs to
// (75, 20). Back right corner (144, 25 1/2) dragged to (144, 10): the back side at x = 75 falls to
// 25.5 - 15.5 x 75 / 144 = 17.43, under the cutout's 20, so the drag is refused; dragged out to (144, 30) it moves.
describe('EZD-413 a corner drag keeps every cutout on its top', () => {
  it('refuses a drag that cuts into a cutout and allows one that does not', () => {
    const placed = placeCountertopCutout(top(), cut({ x: 60, y: 12 }));
    if (placed === null) throw new Error('refused');
    expect(moveCountertopVertex(placed, 2, { x: 144, y: 10 })).toBeNull();
    expect(moveCountertopVertex(placed, 2, { x: 144, y: 30 })?.attributes.cutouts).toEqual([cut({ x: 60, y: 12 })]);
  });
});
