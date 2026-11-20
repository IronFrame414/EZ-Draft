// EZD-413 (S04b Controls "Seam | Click across a piece to split it; seam drawn red dashed | Pieces relabel (A, B, C)";
// AC-EZD-413-1 "A seam yields two relabeled pieces"; vault/build/assumptions.md EZD-413). Hand counts:
// - Straight top 144 x 25 1/2 (board S04b piece A is 141 1/2 x 25 1/2; 144 is the EZD-412 back wall), front y = 0.
//   A click 3" in from the front at x = 100.2 rounds to x = 100 on the 1/2" increment and cuts square to the front:
//   100 x 25 1/2 = 2550 sq in and 44 x 25 1/2 = 1122 sq in, 3672 together. Exposed: the front 144 and the right
//   end 25 1/2 = 169 1/2 before; 100 and 44 + 25 1/2 = 69 1/2 after, still 169 1/2.
// - L top (board S04b A + B before the seam): back 141 1/2 x 25 1/2 = 3608.25 sq in plus a return 25 1/2 x 63 =
//   1606.5 sq in. A click near the outer left side at the inside corner's height cuts across to that corner, as
//   the board's red dashed SEAM: A 141 1/2 x 25 1/2 and B 25 1/2 x 63.
import { describe, expect, it } from 'vitest';
import type { CountertopCutout, CountertopEdge, CountertopPieceData, Point } from '../schema';
import { countertopExposedEdgeIn, countertopPieceAreaSqIn } from './piece';
import { moveCountertopVertex } from './outline';
import {
  countertopLabelRank,
  countertopSeamCount,
  countertopSeamLines,
  relabelCountertops,
  seamChordAt,
  splitCountertopPiece,
} from './seam';

const SEAM = '11111111-1111-4111-8111-111111111111';
const CUT = '22222222-2222-4222-8222-222222222222';

const exposed = (overhang = 1.5): CountertopEdge => ({
  kind: 'exposed',
  overhang,
  backsplashHeight: null,
  profileId: null,
});
const wall = (splash: number | null = 4): CountertopEdge => ({
  kind: 'wall',
  overhang: 0,
  backsplashHeight: splash,
  profileId: null,
});

const piece = (outline: Point[], edges: CountertopEdge[], cutouts?: CountertopCutout[]): CountertopPieceData => ({
  geometry: { outline },
  status: 'new',
  level: 'f1',
  attributes: {
    label: 'A',
    name: 'Back wall',
    materialItemId: null,
    thickness: 1.1811,
    edges,
    ...(cutouts === undefined ? {} : { cutouts }),
  },
});

// Front (y = 0) exposed, right end exposed, back a wall with a 4" splash, left end a wall.
const straight = (cutouts?: CountertopCutout[]) =>
  piece(
    [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 25.5 },
      { x: 0, y: 25.5 },
    ],
    [exposed(), exposed(), wall(), wall()],
    cutouts,
  );

const L = () =>
  piece(
    [
      { x: 0, y: 0 },
      { x: 141.5, y: 0 },
      { x: 141.5, y: 25.5 },
      { x: 25.5, y: 25.5 },
      { x: 25.5, y: 88.5 },
      { x: 0, y: 88.5 },
    ],
    [wall(), wall(), exposed(), exposed(), exposed(), wall()],
  );

const sink = (x: number): CountertopCutout => ({
  id: CUT,
  kind: 'sink',
  center: { x, y: 12.75 },
  axis: { x: 1, y: 0 },
  width: 30,
  depth: 16,
  fixtureId: null,
});

const size = (o: readonly Point[]) => {
  const xs = o.map((p) => p.x);
  const ys = o.map((p) => p.y);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};

describe('EZD-413 where a seam runs', () => {
  it('cuts square to the nearest side, at the click rounded to the increment', () => {
    expect(seamChordAt(straight().geometry.outline, { x: 100.2, y: 3 }, 0.5)).toEqual({
      a: { x: 100, y: 0 },
      b: { x: 100, y: 25.5 },
    });
  });

  it('with no increment the seam stays where clicked', () => {
    const c = seamChordAt(straight().geometry.outline, { x: 100.2, y: 3 }, null);
    expect(c?.a.x).toBeCloseTo(100.2, 9);
    expect(c?.b).toEqual({ x: c?.a.x, y: 25.5 });
  });

  it('on an L it runs from the outer side to the inside corner', () => {
    expect(seamChordAt(L().geometry.outline, { x: 3, y: 25.6 }, 0.5)).toEqual({
      a: { x: 0, y: 25.5 },
      b: { x: 25.5, y: 25.5 },
    });
  });

  it('a click off the piece makes no seam', () => {
    expect(seamChordAt(straight().geometry.outline, { x: 200, y: 3 }, 0.5)).toBeNull();
    expect(seamChordAt(L().geometry.outline, { x: 60, y: 60 }, 0.5)).toBeNull();
  });
});

describe('EZD-413 a seam splits a piece in two (AC-EZD-413-1)', () => {
  it('a straight top cut at 100" makes 100 x 25 1/2 and 44 x 25 1/2, larger first, with the same total area', () => {
    const before = straight();
    const r = splitCountertopPiece(before, { a: { x: 100, y: 0 }, b: { x: 100, y: 25.5 } }, SEAM);
    if (r === null) throw new Error('no split');
    const [one, two] = r;
    expect(size(one.geometry.outline)).toEqual([100, 25.5]);
    expect(size(two.geometry.outline)).toEqual([44, 25.5]);
    expect(countertopPieceAreaSqIn(one)).toBeCloseTo(2550, 9);
    expect(countertopPieceAreaSqIn(two)).toBeCloseTo(1122, 9);
    expect(countertopPieceAreaSqIn(one) + countertopPieceAreaSqIn(two)).toBeCloseTo(3672, 9);
    expect(countertopExposedEdgeIn(before)).toBeCloseTo(169.5, 9);
    expect(countertopExposedEdgeIn(one)).toBeCloseTo(100, 9);
    expect(countertopExposedEdgeIn(two)).toBeCloseTo(69.5, 9);
  });

  it('cut sides keep their kind, overhang and splash; the cut is a seam joint on both pieces', () => {
    const r = splitCountertopPiece(straight(), { a: { x: 100, y: 0 }, b: { x: 100, y: 25.5 } }, SEAM);
    if (r === null) throw new Error('no split');
    const [left, right] = r;
    const seam = { kind: 'wall', overhang: 0, backsplashHeight: null, profileId: null, seamId: SEAM };
    expect(left.geometry.outline).toEqual([
      { x: 100, y: 25.5 },
      { x: 0, y: 25.5 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(left.attributes.edges).toEqual([wall(), wall(), exposed(), seam]);
    expect(right.geometry.outline).toEqual([
      { x: 100, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 25.5 },
      { x: 100, y: 25.5 },
    ]);
    expect(right.attributes.edges).toEqual([exposed(), exposed(), wall(), seam]);
    for (const p of r) {
      expect(p.attributes.name).toBe('Back wall');
      expect(p.attributes.thickness).toBe(1.1811);
      expect(p.level).toBe('f1');
    }
  });

  it('an L cut at the inside corner makes A 141 1/2 x 25 1/2 and B 25 1/2 x 63', () => {
    const r = splitCountertopPiece(L(), { a: { x: 0, y: 25.5 }, b: { x: 25.5, y: 25.5 } }, SEAM);
    if (r === null) throw new Error('no split');
    expect(size(r[0].geometry.outline)).toEqual([141.5, 25.5]);
    expect(size(r[1].geometry.outline)).toEqual([25.5, 63]);
    expect(countertopPieceAreaSqIn(r[0])).toBeCloseTo(3608.25, 9);
    expect(countertopPieceAreaSqIn(r[1])).toBeCloseTo(1606.5, 9);
  });

  it('a cutout goes with the piece it sits on; a seam through a cutout is refused', () => {
    const chord = { a: { x: 100, y: 0 }, b: { x: 100, y: 25.5 } };
    const r = splitCountertopPiece(straight([sink(40)]), chord, SEAM);
    if (r === null) throw new Error('no split');
    expect(r[0].attributes.cutouts).toEqual([sink(40)]);
    expect(r[1].attributes.cutouts).toEqual([]);
    expect(splitCountertopPiece(straight([sink(100)]), chord, SEAM)).toBeNull();
    expect(splitCountertopPiece(straight([sink(110)]), chord, SEAM)).toBeNull(); // spans 95 to 125
  });

  it('a cut that is not across the piece is refused', () => {
    expect(splitCountertopPiece(straight(), { a: { x: 0, y: 0 }, b: { x: 144, y: 0 } }, SEAM)).toBeNull();
    expect(splitCountertopPiece(straight(), { a: { x: 50, y: 5 }, b: { x: 50, y: 25.5 } }, SEAM)).toBeNull();
  });
});

describe('EZD-413 seams counted and drawn once; pieces relabel A, B, C', () => {
  it('the two pieces of one seam make one seam and one line', () => {
    const r = splitCountertopPiece(straight(), { a: { x: 100, y: 0 }, b: { x: 100, y: 25.5 } }, SEAM);
    if (r === null) throw new Error('no split');
    expect(countertopSeamCount([...r, L()])).toBe(1);
    expect(countertopSeamCount([straight(), L()])).toBe(0);
    expect(countertopSeamLines(r)).toEqual([{ seamId: SEAM, a: { x: 100, y: 0 }, b: { x: 100, y: 25.5 } }]);
  });

  it('a seam on A of A, B gives A, B for its pieces and C for the old B', () => {
    const m = relabelCountertops(['A-big', 'A-small', 'old-B']);
    expect([...m.entries()]).toEqual([
      ['A-big', 'A'],
      ['A-small', 'B'],
      ['old-B', 'C'],
    ]);
  });

  it('label order runs A … Z then AA', () => {
    expect(countertopLabelRank('A')).toBe(0);
    expect(countertopLabelRank('C')).toBe(2);
    expect(countertopLabelRank('Z')).toBe(25);
    expect(countertopLabelRank('AA')).toBe(26);
    expect(countertopLabelRank('AB')).toBe(27);
    expect(countertopLabelRank('a')).toBe(Infinity);
  });
});

// EZD-413 review: a corner drag (EZD-412) never moves a seam's end, or the piece across the seam would overlap or
// leave a gap. The left piece of the cut at x = 100 has its seam edge from corner 3 (100, 0) to corner 0 (100, 25 1/2).
describe('EZD-413 a corner that ends a seam does not drag', () => {
  it('both seam corners are refused; a corner off the seam still moves', () => {
    const r = splitCountertopPiece(straight(), { a: { x: 100, y: 0 }, b: { x: 100, y: 25.5 } }, SEAM);
    if (r === null) throw new Error('no split');
    const left = r[0];
    expect(moveCountertopVertex(left, 0, { x: 104, y: 25.5 })).toBeNull();
    expect(moveCountertopVertex(left, 3, { x: 104, y: 0 })).toBeNull();
    expect(moveCountertopVertex(left, 1, { x: 0, y: 30 })?.geometry.outline[1]).toEqual({ x: 0, y: 30 });
  });
});
