// EZD-416 (AC-EZD-416-1 "Footer totals match the pieces"; S04b Controls left panel; board S04bCountertops).
// Hand counts from the board's three pieces after the seam (y grows down the plan):
//   A "Back wall" (0,0)→(141.5,0)→(141.5,25.5)→(25.5,25.5)→(0,25.5): back wall, right wall, front 116" exposed,
//     seam 25.5", left wall. Area 141.5 × 25.5 = 3608.25 sq in.
//   B "Left return" (0,25.5)→(25.5,25.5)→(25.5,88.5)→(0,88.5): seam, front 63" exposed, end 25.5" exposed, left
//     wall. Area 25.5 × 63 = 1606.5 sq in.
//   C "Island" 76.5 × 37.5, every side exposed (back seating 12"). Area 2868.75 sq in; exposed 2 × 114 = 228".
// Totals: 3 pieces, 1 seam (A and B share it), 8083.5 sq in / 144 = 56.135 → "56.1 sq ft" (board); exposed
// 116 + 63 + 25.5 + 228 = 432.5" = 36.04 lf → "36 lf" (board status bar).
import { describe, expect, it } from 'vitest';
import type { CountertopEdge, CountertopEdgeKind, CountertopPieceData, Point } from '../schema';
import {
  countertopEdgeRows,
  countertopFooter,
  countertopHasSeating,
  countertopMaterialSummary,
  countertopPieceSize,
  withBacksplashHeight,
} from './panel';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const SEAM = 'e0000000-0000-4000-8000-000000000001';
type E = CountertopEdgeKind | 'seam';
const edge = (kind: E): CountertopEdge =>
  kind === 'seam'
    ? { kind: 'wall', overhang: 0, backsplashHeight: null, profileId: null, seamId: SEAM }
    : {
        kind,
        overhang: kind === 'seating' ? 12 : kind === 'exposed' ? 1.5 : 0,
        backsplashHeight: kind === 'wall' ? 4 : null,
        profileId: null,
      };
const piece = (label: string, outline: Point[], kinds: E[]): CountertopPieceData => ({
  geometry: { outline },
  status: 'new',
  level: LEVEL,
  attributes: { label, name: '', materialItemId: null, thickness: 3 / 2.54, edges: kinds.map(edge) },
});
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const A = piece(
  'A',
  [
    { x: 0, y: 0 },
    { x: 141.5, y: 0 },
    { x: 141.5, y: 25.5 },
    { x: 25.5, y: 25.5 },
    { x: 0, y: 25.5 },
  ],
  ['wall', 'wall', 'exposed', 'seam', 'wall'],
);
const B = piece('B', rect(0, 25.5, 25.5, 88.5), ['seam', 'exposed', 'exposed', 'wall']);
const C = piece('C', rect(0, 0, 76.5, 37.5), ['exposed', 'exposed', 'seating', 'exposed']);

describe('EZD-416 countertop panel readouts', () => {
  it('AC-EZD-416-1: the footer totals of the board pieces are 3 pieces, 1 seam, 56.1 sq ft, 36 lf', () => {
    expect(countertopFooter([A, B, C])).toEqual({
      pieces: 3,
      seams: 1,
      areaSqFt: 56.1,
      exposedEdgeLf: 36,
    });
  });

  it('AC-EZD-416-1: the totals follow the pieces: the island alone is 1 piece, no seam, 19.9 sq ft, 19 lf', () => {
    // 2868.75 / 144 = 19.92 → 19.9 (board island header "19.9 sq ft"); 228" = 19 lf.
    expect(countertopFooter([C])).toEqual({ pieces: 1, seams: 0, areaSqFt: 19.9, exposedEdgeLf: 19 });
    // A and B without the island: 5214.75 / 144 = 36.21 → 36.2; 204.5" = 17.04 → 17 lf.
    expect(countertopFooter([A, B])).toEqual({ pieces: 2, seams: 1, areaSqFt: 36.2, exposedEdgeLf: 17 });
    expect(countertopFooter([])).toEqual({ pieces: 0, seams: 0, areaSqFt: 0, exposedEdgeLf: 0 });
  });

  it('rounds half up: 6" of exposed edge is half a foot and shows 1 lf', () => {
    const small = piece('A', rect(0, 0, 6, 6), ['exposed', 'wall', 'wall', 'wall']);
    expect(countertopFooter([small]).exposedEdgeLf).toBe(1);
  });

  it('sizes a piece along its longest side (board "141 1/2 × 25 1/2", "63 × 25 1/2", "76 1/2 × 37 1/2")', () => {
    expect(countertopPieceSize(A)).toEqual({ length: 141.5, depth: 25.5 });
    expect(countertopPieceSize(B)).toEqual({ length: 63, depth: 25.5 });
    expect(countertopPieceSize(C)).toEqual({ length: 76.5, depth: 37.5 });
  });

  it('tags a piece with a seating edge', () => {
    expect([A, B, C].map(countertopHasSeating)).toEqual([false, false, true]);
  });

  it('lists edges with type exposed, wall or splash, overhang and length', () => {
    expect(countertopEdgeRows(B)).toEqual([
      { index: 0, type: 'wall', seating: false, overhang: 0, length: 25.5 },
      { index: 1, type: 'exposed', seating: false, overhang: 1.5, length: 63 },
      { index: 2, type: 'exposed', seating: false, overhang: 1.5, length: 25.5 },
      { index: 3, type: 'splash', seating: false, overhang: 0, length: 63 },
    ]);
    expect(countertopEdgeRows(C)[2]).toEqual({
      index: 2,
      type: 'exposed',
      seating: true,
      overhang: 12,
      length: 76.5,
    });
  });

  it('summarises material, thickness, splash and behind range over the pieces', () => {
    const s = countertopMaterialSummary([A, B, C]);
    expect(s.materialItemId).toEqual({ kind: 'one', value: null });
    expect(s.thickness).toEqual({ kind: 'one', value: 3 / 2.54 });
    expect(s.backsplashHeight).toEqual({ kind: 'one', value: 4 });
    expect(s.behindRange).toEqual({ kind: 'one', value: 'splash' });
    const tall = withBacksplashHeight(B, 6);
    expect(countertopMaterialSummary([A, tall]).backsplashHeight).toEqual({ kind: 'mixed' });
    expect(countertopMaterialSummary([C]).backsplashHeight).toEqual({ kind: 'none' });
    expect(countertopMaterialSummary([]).thickness).toEqual({ kind: 'none' });
  });

  it('a new backsplash height changes splash edges only; the seam keeps no splash', () => {
    const r = withBacksplashHeight(A, 6).attributes.edges.map((e) => e.backsplashHeight);
    expect(r).toEqual([6, 6, null, null, 6]);
  });
});
