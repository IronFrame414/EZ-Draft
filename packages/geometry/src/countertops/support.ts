// EZD-415 (S04b Controls "Support notice ... Shown when seating overhang exceeds limit", "Seats row | Display seat
// count and spacing"; S04b Validation "Seating overhang past company limit: brackets added to a detail and notice
// shown"; S15d Countertops "Seating overhang support limit ... Empty = support check off"; AC-EZD-415-1;
// vault/build/assumptions.md EZD-415): the seating support check of one top. Pure.
//
// A seating edge whose overhang is past (strictly beyond) the company limit needs support brackets along its length.
// Brackets: one per bracket spacing of side length or part of it, ceil(length / spacing), each bracket at the middle of
// its bay so no bracket carries more than one spacing of top. Seats: whole seat widths along the side,
// floor(length / seat width). AC-EZD-415-1: a 76 1/2" side → ceil(76.5 / 24) = 4 brackets, floor(76.5 / 24) = 3 seats.
import type { CountertopPieceData } from '../schema';
import { countertopEdgeLengthIn } from './piece';

// Lengths come from outline corners, so a side meant to be 72" may read 71.99999999; counts allow that much.
const EPS = 1e-6;

export type CountertopSupportSettings = {
  // Defaults → Countertops "Seating overhang support limit"; null = Not set (the check is off).
  limit: number | null;
  // Defaults → Countertops "Bracket spacing" (on centre); null = Not set.
  bracketSpacing: number | null;
  // Defaults → Countertops "Seat width"; null = Not set.
  seatWidth: number | null;
};

const usable = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Brackets along a side of `length` at `spacing` o.c.; 0 for no length.
export function countertopBracketCount(length: number, spacing: number): number {
  if (!(length > EPS) || !usable(spacing)) return 0;
  return Math.ceil(length / spacing - EPS);
}

// Seats along a side of `length`, each `seatWidth` wide.
export function countertopSeatCount(length: number, seatWidth: number): number {
  if (!(length > 0) || !usable(seatWidth)) return 0;
  return Math.floor(length / seatWidth + EPS);
}

export type CountertopSeatingSide = {
  edge: number;
  length: number;
  overhang: number;
  // Overhang past the limit; false while the limit is Not set.
  needsSupport: boolean;
  // Brackets this side needs; null when it needs none or the spacing is Not set.
  brackets: number | null;
  // Seats along this side; null while the seat width is Not set.
  seats: number | null;
};

// Every seating edge of the top, in edge order.
export function countertopSeatingSides(
  piece: CountertopPieceData,
  s: CountertopSupportSettings,
): CountertopSeatingSide[] {
  const out: CountertopSeatingSide[] = [];
  const { outline } = piece.geometry;
  piece.attributes.edges.forEach((e, i) => {
    if (e.kind !== 'seating' || e.seamId !== undefined) return;
    const length = countertopEdgeLengthIn(outline, i);
    const needsSupport = usable(s.limit) && e.overhang > s.limit;
    out.push({
      edge: i,
      length,
      overhang: e.overhang,
      needsSupport,
      brackets: needsSupport && usable(s.bracketSpacing) ? countertopBracketCount(length, s.bracketSpacing) : null,
      seats: usable(s.seatWidth) ? countertopSeatCount(length, s.seatWidth) : null,
    });
  });
  return out;
}

// The support requirement stored on the piece (attributes.support): the deepest overhang past the limit, the brackets
// of every side past it, and the spacing they were counted at. Null when no side needs support or the limit is Not
// set. Brackets and spacing are null while the spacing is Not set.
export type CountertopSupport = { overhang: number; brackets: number | null; spacing: number | null };

export function countertopSupportRequirement(
  piece: CountertopPieceData,
  s: CountertopSupportSettings,
): CountertopSupport | null {
  const needing = countertopSeatingSides(piece, s).filter((side) => side.needsSupport);
  if (needing.length === 0) return null;
  const overhang = Math.max(...needing.map((side) => side.overhang));
  if (!usable(s.bracketSpacing)) return { overhang, brackets: null, spacing: null };
  return {
    overhang,
    brackets: needing.reduce((n, side) => n + (side.brackets ?? 0), 0),
    spacing: s.bracketSpacing,
  };
}

// The piece with its support requirement worked out again: set when a side needs support, removed when none does.
// Every change that moves a seating side's length or overhang calls it (overhang, seam, corner drag), so a split top
// never keeps the whole top's brackets.
export function withCountertopSupport(piece: CountertopPieceData, s: CountertopSupportSettings): CountertopPieceData {
  const need = countertopSupportRequirement(piece, s);
  const attributes = { ...piece.attributes };
  if (need === null) delete attributes.support;
  else attributes.support = need;
  return { ...piece, attributes };
}

// Two requirements the same (absent and null both mean none).
export function sameCountertopSupport(
  a: CountertopSupport | null | undefined,
  b: CountertopSupport | null | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.overhang === b.overhang && a.brackets === b.brackets && a.spacing === b.spacing;
}
