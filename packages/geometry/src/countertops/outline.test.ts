// EZD-412 (S04b Draw outline "Click points to draw a custom top shape; typed lengths | Snaps as in 03"; "Drag outline
// vertex | Reshape custom outline"; 03c label A/B…). Expected values are hand counts.
import { describe, expect, it } from 'vitest';
import type { Point } from '../schema';
import {
  countertopFromOutline,
  countertopLabelAt,
  isValidCountertopOutline,
  moveCountertopVertex,
  nextCountertopLabels,
  outlineClick,
  outlineTypedPoint,
  snapOutlinePoint,
} from './outline';
import { countertopExposedEdgeIn, countertopPieceAreaSqFt } from './piece';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 48, y: 0 },
  { x: 48, y: 24 },
  { x: 0, y: 24 },
];

describe('EZD-412 countertop labels', () => {
  it('go A … Z, then AA, AB …', () => {
    expect(countertopLabelAt(0)).toBe('A');
    expect(countertopLabelAt(25)).toBe('Z');
    expect(countertopLabelAt(26)).toBe('AA');
    expect(countertopLabelAt(27)).toBe('AB');
    expect(countertopLabelAt(52)).toBe('BA');
  });

  it('the next labels skip the ones in use', () => {
    expect(nextCountertopLabels([], 2)).toEqual(['A', 'B']);
    expect(nextCountertopLabels(['A', 'C'], 3)).toEqual(['B', 'D', 'E']);
  });
});

describe('EZD-412 Draw outline', () => {
  it('clicks add corners and a click on the first corner closes the shape', () => {
    let draft = { points: [] as Point[] };
    for (const p of SQUARE) {
      const r = outlineClick(draft, p, 2);
      expect(r.kind).toBe('added');
      if (r.kind === 'added') draft = r.draft;
    }
    const closed = outlineClick(draft, { x: 1, y: 1 }, 2);
    expect(closed).toEqual({ kind: 'closed', points: SQUARE });
  });

  it('two corners cannot close; a repeated corner is ignored', () => {
    const two = { points: SQUARE.slice(0, 2) };
    expect(outlineClick(two, { x: 0, y: 0 }, 2).kind).toBe('added');
    expect(outlineClick(two, { x: 48, y: 0 }, 2).kind).toBe('ignored');
  });

  it('a typed length places the next corner that far toward the pointer', () => {
    const draft = { points: [{ x: 10, y: 10 }] };
    expect(outlineTypedPoint(draft, 30, { x: 100, y: 10 })).toEqual({ x: 40, y: 10 });
    expect(outlineTypedPoint(draft, 25, { x: 13, y: 14 })).toEqual({ x: 25, y: 30 });
    expect(outlineTypedPoint({ points: [] }, 30, { x: 1, y: 1 })).toBeNull();
    expect(outlineTypedPoint(draft, 0, { x: 100, y: 10 })).toBeNull();
  });

  it('snaps to a cabinet or top corner within the radius first', () => {
    const p = snapOutlinePoint(
      { x: 47.2, y: 0.4 },
      { targets: [{ x: 48, y: 0 }], last: null, increment: 0.5, radius: 2 },
    );
    expect(p).toEqual({ x: 48, y: 0 });
  });

  it('otherwise snaps the direction to 15° and the length to the countertop increment', () => {
    // From (0, 0) toward (40.3, 1.1): 1.56° rounds to 0°, length 40.315 rounds to 40 1/2 at 1/2".
    const p = snapOutlinePoint(
      { x: 40.3, y: 1.1 },
      { targets: [], last: { x: 0, y: 0 }, increment: 0.5, radius: 2 },
    );
    expect(p.x).toBeCloseTo(40.5, 9);
    expect(p.y).toBe(0);
    // With no last corner, the point goes to the 1/2" grid.
    expect(
      snapOutlinePoint({ x: 3.3, y: 7.8 }, { targets: [], last: null, increment: 0.5, radius: 2 }),
    ).toEqual({
      x: 3.5,
      y: 8,
    });
  });

  it('the closed outline makes a piece with one exposed edge per side', () => {
    const piece = countertopFromOutline(SQUARE, { level: LEVEL, label: 'C', thickness: 1.25 });
    expect(piece).not.toBeNull();
    expect(piece!.attributes.label).toBe('C');
    expect(piece!.attributes.edges).toHaveLength(4);
    expect(piece!.attributes.edges.every((e) => e.kind === 'exposed' && e.overhang === 0)).toBe(
      true,
    );
    // 48 x 24 = 1152 sq in = 8 sq ft; exposed 2 x (48 + 24) = 144".
    expect(countertopPieceAreaSqFt(piece!)).toBe(8);
    expect(countertopExposedEdgeIn(piece!)).toBe(144);
  });

  it('a crossing or flat outline makes no piece', () => {
    const bow: Point[] = [
      { x: 0, y: 0 },
      { x: 48, y: 24 },
      { x: 48, y: 0 },
      { x: 0, y: 24 },
    ];
    expect(isValidCountertopOutline(bow)).toBe(false);
    expect(
      isValidCountertopOutline([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ]),
    ).toBe(false);
    expect(countertopFromOutline(bow, { level: LEVEL, label: 'A', thickness: 1.25 })).toBeNull();
  });

  it('dragging a corner reshapes the outline and keeps the edges', () => {
    const piece = countertopFromOutline(SQUARE, { level: LEVEL, label: 'A', thickness: 1.25 })!;
    const moved = moveCountertopVertex(piece, 2, { x: 60, y: 24 });
    expect(moved!.geometry.outline[2]).toEqual({ x: 60, y: 24 });
    // Trapezoid: (48 + 60) / 2 x 24 = 1296 sq in = 9 sq ft.
    expect(countertopPieceAreaSqFt(moved!)).toBe(9);
    expect(moved!.attributes.edges).toEqual(piece.attributes.edges);
    // A drag that folds the outline over itself is refused.
    expect(moveCountertopVertex(piece, 2, { x: 24, y: -10 })).toBeNull();
    expect(moveCountertopVertex(piece, 9, { x: 0, y: 0 })).toBeNull();
  });
});
