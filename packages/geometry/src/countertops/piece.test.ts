// EZD-411 (AC-EZD-411-1 "exposed LF of an L-shaped top matches a hand count"; 09f Countertop rules; S04b).
// Expected numbers are hand counts from board S04b (vault/mockups/S04bCountertops.png): piece A "Back wall"
// 141 1/2 x 25 1/2 and piece B "Left return" 63 x 25 1/2 make one L top (before the seam), against the back wall,
// the left wall and the right wall at A's end; piece C "Island" 76 1/2 x 37 1/2 stands free. The board's status bar
// reads "Exposed edge 36 lf" and its footer "56.1 sq ft"; the island header reads "19.9 sq ft".
import { describe, expect, it } from 'vitest';
import type { CountertopEdge, CountertopEdgeKind, CountertopPieceData, Point } from '../schema';
import {
  countertopEdgeLengthIn,
  countertopExposedEdgeIn,
  countertopExposedEdgeLf,
  countertopPieceAreaSqFt,
  countertopPieceAreaSqIn,
  countertopTotals,
  isExposedEdgeKind,
} from './piece';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const edge = (kind: CountertopEdgeKind): CountertopEdge => ({
  kind,
  overhang: kind === 'seating' ? 12 : kind === 'exposed' ? 1.5 : 0,
  backsplashHeight: kind === 'wall' ? 4 : null,
  profileId: null,
});
const piece = (outline: Point[], kinds: CountertopEdgeKind[]): CountertopPieceData => ({
  geometry: { outline },
  status: 'new',
  level: LEVEL,
  attributes: { label: 'A', name: '', materialItemId: null, thickness: 1.1811, edges: kinds.map(edge) },
});

// The L, corners walked clockwise on screen from the back-left corner (y grows down the plan):
//   edge 0 (0,0)→(141.5,0)        back wall          141.5"  wall
//   edge 1 (141.5,0)→(141.5,25.5) right wall at A    25.5"   wall
//   edge 2 (141.5,25.5)→(25.5,25.5) front of A       116"    exposed (141.5 − 25.5)
//   edge 3 (25.5,25.5)→(25.5,88.5) front of B        63"     exposed
//   edge 4 (25.5,88.5)→(0,88.5)   end of B           25.5"   exposed
//   edge 5 (0,88.5)→(0,0)         left wall          88.5"   wall (25.5 + 63)
const L_OUTLINE: Point[] = [
  { x: 0, y: 0 },
  { x: 141.5, y: 0 },
  { x: 141.5, y: 25.5 },
  { x: 25.5, y: 25.5 },
  { x: 25.5, y: 88.5 },
  { x: 0, y: 88.5 },
];
const L_TOP = piece(L_OUTLINE, ['wall', 'wall', 'exposed', 'exposed', 'exposed', 'wall']);

// The island: front and both ends at 1 1/2", back at 12" seating, every side exposed.
const ISLAND = piece(
  [
    { x: 0, y: 0 },
    { x: 76.5, y: 0 },
    { x: 76.5, y: 37.5 },
    { x: 0, y: 37.5 },
  ],
  ['exposed', 'exposed', 'seating', 'exposed'],
);

describe('EZD-411 countertop piece measures', () => {
  it('AC-EZD-411-1: exposed LF of an L-shaped top matches a hand count', () => {
    // 116 + 63 + 25.5 = 204.5"; 204.5 / 12 = 17 1/24 lf.
    expect(countertopExposedEdgeIn(L_TOP)).toBeCloseTo(204.5, 9);
    expect(countertopExposedEdgeLf(L_TOP)).toBeCloseTo(204.5 / 12, 9);
  });

  it('each edge is the outline side from its corner to the next', () => {
    const lengths = L_OUTLINE.map((_, i) => countertopEdgeLengthIn(L_OUTLINE, i));
    expect(lengths).toEqual([141.5, 25.5, 116, 63, 25.5, 88.5]);
  });

  it('wall edges are not exposed; seating and flush edges are', () => {
    expect(isExposedEdgeKind('wall')).toBe(false);
    expect(isExposedEdgeKind('exposed')).toBe(true);
    expect(isExposedEdgeKind('seating')).toBe(true);
    expect(isExposedEdgeKind('flush')).toBe(true);
    // B's end made flush still counts: 204.5".
    const flushEnd = piece(L_OUTLINE, ['wall', 'wall', 'exposed', 'exposed', 'flush', 'wall']);
    expect(countertopExposedEdgeIn(flushEnd)).toBeCloseTo(204.5, 9);
    // B's end against a wall instead: 204.5 − 25.5 = 179".
    const walledEnd = piece(L_OUTLINE, ['wall', 'wall', 'exposed', 'exposed', 'wall', 'wall']);
    expect(countertopExposedEdgeIn(walledEnd)).toBeCloseTo(179, 9);
  });

  it('a free-standing island is exposed all round, the seating side included', () => {
    // 2 × (76.5 + 37.5) = 228" = 19 lf.
    expect(countertopExposedEdgeIn(ISLAND)).toBeCloseTo(228, 9);
    expect(countertopExposedEdgeLf(ISLAND)).toBeCloseTo(19, 9);
  });

  it('area per piece in square feet', () => {
    // L: 141.5 × 25.5 + 25.5 × 63 = 3608.25 + 1606.5 = 5214.75 sq in.
    expect(countertopPieceAreaSqIn(L_TOP)).toBeCloseTo(5214.75, 9);
    // Island: 76.5 × 37.5 = 2868.75 sq in = 19.92 sq ft; board "19.9 sq ft".
    expect(countertopPieceAreaSqFt(ISLAND)).toBeCloseTo(2868.75 / 144, 9);
    expect(countertopPieceAreaSqFt(ISLAND).toFixed(1)).toBe('19.9');
  });

  it('totals over the board pieces match the footer and status bar', () => {
    const t = countertopTotals([L_TOP, ISLAND]);
    expect(t.pieces).toBe(2);
    // (5214.75 + 2868.75) / 144 = 8083.5 / 144 = 56.135 sq ft; board footer "56.1 sq ft".
    expect(t.areaSqFt).toBeCloseTo(8083.5 / 144, 9);
    expect(t.areaSqFt.toFixed(1)).toBe('56.1');
    // (204.5 + 228) / 12 = 432.5 / 12 = 36.04 lf; board status bar "Exposed edge 36 lf".
    expect(t.exposedEdgeLf).toBeCloseTo(432.5 / 12, 9);
    expect(Math.round(t.exposedEdgeLf)).toBe(36);
  });

  it('no pieces total zero', () => {
    expect(countertopTotals([])).toEqual({ pieces: 0, areaSqFt: 0, exposedEdgeLf: 0 });
  });
});
