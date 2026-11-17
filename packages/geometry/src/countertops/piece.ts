// EZD-411 (09f Countertop rules "Area per piece and total in square feet; exposed edge length in linear feet";
// S04b footer totals and status bar "Exposed edge (lf)"; 09i Countertops "SF per piece and exposed edge LF";
// AC-EZD-411-1; vault/build/assumptions.md EZD-411): what a countertop piece measures. Values are derived, never
// stored, and never rounded here; the screen rounds for display.
import { outlineAreaSqIn } from '../rooms/area';
import type { CountertopEdgeKind, CountertopPieceData, Point } from '../schema';

const SQ_IN_PER_SQ_FT = 144;
const IN_PER_FT = 12;

// The edge profile goes on every edge that is not against a wall (09f "Edge profile applies to exposed edges only;
// wall edges take backsplash"). A seating side and a flush end are exposed edges too.
export function isExposedEdgeKind(kind: CountertopEdgeKind): boolean {
  return kind !== 'wall';
}

// Edge i runs from outline[i] to outline[(i + 1) % n].
export function countertopEdgeSegment(outline: readonly Point[], index: number): readonly [Point, Point] {
  const n = outline.length;
  return [outline[index]!, outline[(index + 1) % n]!];
}

export function countertopEdgeLengthIn(outline: readonly Point[], index: number): number {
  const [a, b] = countertopEdgeSegment(outline, index);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function countertopPieceAreaSqIn(piece: CountertopPieceData): number {
  return outlineAreaSqIn(piece.geometry.outline);
}

export function countertopPieceAreaSqFt(piece: CountertopPieceData): number {
  return countertopPieceAreaSqIn(piece) / SQ_IN_PER_SQ_FT;
}

export function countertopExposedEdgeIn(piece: CountertopPieceData): number {
  const { outline } = piece.geometry;
  let total = 0;
  piece.attributes.edges.forEach((edge, i) => {
    if (isExposedEdgeKind(edge.kind)) total += countertopEdgeLengthIn(outline, i);
  });
  return total;
}

export function countertopExposedEdgeLf(piece: CountertopPieceData): number {
  return countertopExposedEdgeIn(piece) / IN_PER_FT;
}

export type CountertopTotals = { pieces: number; areaSqFt: number; exposedEdgeLf: number };

// The footer and status bar totals over every piece shown.
export function countertopTotals(pieces: readonly CountertopPieceData[]): CountertopTotals {
  let areaSqIn = 0;
  let exposedIn = 0;
  for (const piece of pieces) {
    areaSqIn += countertopPieceAreaSqIn(piece);
    exposedIn += countertopExposedEdgeIn(piece);
  }
  return { pieces: pieces.length, areaSqFt: areaSqIn / SQ_IN_PER_SQ_FT, exposedEdgeLf: exposedIn / IN_PER_FT };
}
