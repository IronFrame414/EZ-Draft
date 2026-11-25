// EZD-418 (AC-EZD-418-1 "Schedule matches the pieces"; 08 Exports "Countertop schedule | Piece, material, thickness,
// area, edge profile, edge length"). Hand counts from the board's three pieces (as panel.test.ts):
//   A "Back wall" 141.5 × 25.5 = 3608.25 sq in; exposed only the 116" front.
//   B "Left return" 25.5 × 63 = 1606.5 sq in; exposed the 63" front and the 25.5" end = 88.5".
//   C "Island" 76.5 × 37.5 = 2868.75 sq in; every side exposed, 2 × (76.5 + 37.5) = 228".
import { describe, expect, it } from 'vitest';
import type { CountertopEdge, CountertopEdgeKind, CountertopPieceData, Point } from '../schema';
import { countertopScheduleRows } from './schedule';

const LEVEL = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const SEAM = 'e0000000-0000-4000-8000-000000000001';
const P1 = 'f0000000-0000-4000-8000-000000000001';
const P2 = 'f0000000-0000-4000-8000-000000000002';
type E = CountertopEdgeKind | 'seam';
const edge = (kind: E, profileId: string | null = null): CountertopEdge =>
  kind === 'seam'
    ? { kind: 'wall', overhang: 0, backsplashHeight: null, profileId: null, seamId: SEAM }
    : {
        kind,
        overhang: kind === 'seating' ? 12 : kind === 'exposed' ? 1.5 : 0,
        backsplashHeight: kind === 'wall' ? 4 : null,
        profileId: kind === 'wall' ? null : profileId,
      };
const piece = (label: string, name: string, outline: Point[], edges: CountertopEdge[]): CountertopPieceData => ({
  geometry: { outline },
  status: 'new',
  level: LEVEL,
  attributes: { label, name, materialItemId: null, thickness: 3 / 2.54, edges },
});
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const A = piece(
  'A',
  'Back wall',
  [
    { x: 0, y: 0 },
    { x: 141.5, y: 0 },
    { x: 141.5, y: 25.5 },
    { x: 25.5, y: 25.5 },
    { x: 0, y: 25.5 },
  ],
  (['wall', 'wall', 'exposed', 'seam', 'wall'] as E[]).map((k) => edge(k)),
);
const B = piece('B', 'Left return', rect(0, 25.5, 25.5, 88.5), (['seam', 'exposed', 'exposed', 'wall'] as E[]).map((k) => edge(k)));
const C = piece('C', 'Island', rect(0, 120, 76.5, 157.5), (['exposed', 'exposed', 'seating', 'exposed'] as E[]).map((k) => edge(k)));

describe('EZD-418 countertop schedule rows', () => {
  it('AC-EZD-418-1: one row per piece with its area and exposed edge, in label order', () => {
    const rows = countertopScheduleRows([C, A, B]);
    expect(rows.map((r) => [r.label, r.name, r.areaSqIn, r.edgeIn])).toEqual([
      ['A', 'Back wall', 3608.25, 116],
      ['B', 'Left return', 1606.5, 88.5],
      ['C', 'Island', 2868.75, 228],
    ]);
    expect(rows.every((r) => r.thickness === 3 / 2.54 && r.materialItemId === null)).toBe(true);
    expect(rows.every((r) => r.profileIds.length === 0)).toBe(true);
  });

  it('lists each profile on an exposed edge once, in edge order', () => {
    const island = piece('C', 'Island', rect(0, 0, 76.5, 37.5), [
      edge('exposed', P2),
      edge('exposed', P1),
      edge('seating', P2.toUpperCase()),
      edge('exposed', null),
    ]);
    expect(countertopScheduleRows([island])[0]!.profileIds).toEqual([P2, P1]);
  });

  it('puts two-letter labels after Z', () => {
    const z = { ...A, attributes: { ...A.attributes, label: 'Z' } };
    const aa = { ...A, attributes: { ...A.attributes, label: 'AA' } };
    expect(countertopScheduleRows([aa, z, B]).map((r) => r.label)).toEqual(['B', 'Z', 'AA']);
  });

  it('is empty with no pieces', () => {
    expect(countertopScheduleRows([])).toEqual([]);
  });
});
