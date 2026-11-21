// EZD-416 (S04b Controls "Piece row ... Shows label, name, size, "seating" tag", "Tab: Edges | Lists edges by piece
// with overhang and exposed/wall/splash", "Footer totals | Display: pieces, seams, total sq ft"; S04b Layout "Status
// bar adds Exposed edge (lf)"; board S04bCountertops "141 1/2 × 25 1/2", "3 pieces · 1 seam", "56.1 sq ft", "36 lf";
// AC-EZD-416-1; vault/build/assumptions.md EZD-416): what the countertop left panel and status bar read from the
// pieces. Pure; display rounding is here so the panel and its tests agree on one rule.
import type { CountertopBehindRange, CountertopPieceData } from '../schema';
import { countertopEdgeLengthIn, countertopTotals } from './piece';
import { countertopSeamCount } from './seam';

// A piece's size as the panel shows it: its extent along its longest side, then its extent square to that side
// (board: back top "141 1/2 × 25 1/2", island "76 1/2 × 37 1/2").
export function countertopPieceSize(piece: CountertopPieceData): { length: number; depth: number } {
  const o = piece.geometry.outline;
  let best = -1;
  let ux = 1;
  let uy = 0;
  for (let i = 0; i < o.length; i++) {
    const len = countertopEdgeLengthIn(o, i);
    if (len > best) {
      const a = o[i]!;
      const b = o[(i + 1) % o.length]!;
      best = len;
      ux = (b.x - a.x) / len;
      uy = (b.y - a.y) / len;
    }
  }
  if (best <= 0) return { length: 0, depth: 0 };
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of o) {
    const u = p.x * ux + p.y * uy;
    const v = -p.x * uy + p.y * ux;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  return { length: maxU - minU, depth: maxV - minV };
}

// A piece with a seating edge carries the board's "seating" tag.
export const countertopHasSeating = (piece: CountertopPieceData): boolean =>
  piece.attributes.edges.some((e) => e.kind === 'seating');

// The Edges tab's type for one edge (S04b Decisions "type (exposed, wall or splash)"): a wall edge with a splash is
// "splash", a wall edge or seam without one is "wall", every other edge is exposed.
export type CountertopEdgeType = 'exposed' | 'wall' | 'splash';

export type CountertopEdgeRow = {
  index: number;
  type: CountertopEdgeType;
  seating: boolean;
  overhang: number;
  length: number;
};

export function countertopEdgeRows(piece: CountertopPieceData): CountertopEdgeRow[] {
  const o = piece.geometry.outline;
  return piece.attributes.edges.map((e, index) => ({
    index,
    type: e.kind !== 'wall' ? 'exposed' : e.backsplashHeight !== null ? 'splash' : 'wall',
    seating: e.kind === 'seating',
    overhang: e.overhang,
    length: countertopEdgeLengthIn(o, index),
  }));
}

export type CountertopFooter = {
  pieces: number;
  seams: number;
  // Total area to one decimal place (board "56.1 sq ft").
  areaSqFt: number;
  // Exposed edge to the whole foot (board status bar "36 lf").
  exposedEdgeLf: number;
};

// Half up at the given number of decimal places, with a margin so float noise cannot drop an exact half.
const roundHalfUp = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.floor(n * f + 0.5 + 1e-9) / f;
};

// The footer totals and the status bar's exposed edge, over the pieces shown.
export function countertopFooter(pieces: readonly CountertopPieceData[]): CountertopFooter {
  const t = countertopTotals(pieces);
  return {
    pieces: t.pieces,
    seams: countertopSeamCount(pieces),
    areaSqFt: roundHalfUp(t.areaSqFt, 1),
    exposedEdgeLf: roundHalfUp(t.exposedEdgeLf, 0),
  };
}

// One value shared by every piece shown, `mixed` when they differ, `none` with no pieces (or nothing to read).
export type Shared<T> = { kind: 'one'; value: T } | { kind: 'mixed' } | { kind: 'none' };

function shared<T>(values: readonly T[]): Shared<T> {
  if (values.length === 0) return { kind: 'none' };
  const first = values[0]!;
  return values.every((v) => v === first) ? { kind: 'one', value: first } : { kind: 'mixed' };
}

export type CountertopMaterialSummary = {
  materialItemId: Shared<string | null>;
  thickness: Shared<number>;
  // The splash height on every wall edge that has one; `none` when no edge has a splash.
  backsplashHeight: Shared<number>;
  behindRange: Shared<CountertopBehindRange>;
};

// The Material section over the pieces shown (vault/build/assumptions.md EZD-416: one setting for every top).
export function countertopMaterialSummary(
  pieces: readonly CountertopPieceData[],
): CountertopMaterialSummary {
  return {
    materialItemId: shared(pieces.map((p) => p.attributes.materialItemId)),
    thickness: shared(pieces.map((p) => p.attributes.thickness)),
    backsplashHeight: shared(
      pieces.flatMap((p) =>
        p.attributes.edges.flatMap((e) =>
          e.kind === 'wall' && e.backsplashHeight !== null ? [e.backsplashHeight] : [],
        ),
      ),
    ),
    behindRange: shared(pieces.map((p) => p.attributes.behindRange ?? 'splash')),
  };
}

// The piece with a new backsplash height on every wall edge that has a splash; seams and joints keep none.
export function withBacksplashHeight(piece: CountertopPieceData, height: number): CountertopPieceData {
  return {
    ...piece,
    attributes: {
      ...piece.attributes,
      edges: piece.attributes.edges.map((e) =>
        e.kind === 'wall' && e.backsplashHeight !== null ? { ...e, backsplashHeight: height } : e,
      ),
    },
  };
}
