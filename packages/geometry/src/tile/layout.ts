// EZD-733 (phase-07 EZD-733 "Tile pattern, start point and visible cuts on the plan and the elevations"; S19 "Tile
// pattern select | Straight / diagonal / herringbone"; 09i Tile; vault/build/assumptions.md EZD-733): the tile pieces
// of a layout over a region, each marked cut when it is smaller than a whole tile. Worked out each time, never stored.
//
// Frame: the start point is the lower-left corner of one whole tile. Straight lays tiles in rows and columns, tile
// width along x and height along y, one joint apart. Diagonal is the same grid turned 45 degrees about the start
// point. Herringbone lays the tiles in alternate horizontal and vertical pairs, the long side along the zig-zag,
// turned 45 degrees so the zig-zag runs along x; each tile sits in a cell one joint longer and wider than itself.
// Lengths are inches and are never rounded (03g).
import type { Point, TilePattern } from '../schema';

export type TileSpec = {
  pattern: TilePattern;
  tileWidth: number;
  tileHeight: number;
  joint: number;
};

// A piece of tile inside the region: its outline, and cut when it is less than a whole tile.
export type TilePiece = { points: Point[]; cut: boolean };

export type TilePieces = {
  pieces: TilePiece[];
  // More tiles than MAX_TILE_PIECES would be laid; nothing is drawn (assumptions.md EZD-733).
  tooMany: boolean;
};

export const MAX_TILE_PIECES = 20000;

// A piece whose area is within this of a whole tile is whole; one smaller than this is left out (square inches).
const AREA_TOLERANCE = 1e-6;

const ROOT_HALF = Math.SQRT1_2;

const area = (ring: readonly Point[]): number => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

// The part of `subject` (any simple polygon) inside `clip` (a convex polygon, counter-clockwise).
// Sutherland-Hodgman; an empty array when nothing is left.
export function clipToConvex(subject: readonly Point[], clip: readonly Point[]): Point[] {
  let out: Point[] = [...subject];
  for (let i = 0; i < clip.length && out.length > 0; i++) {
    const a = clip[i]!;
    const b = clip[(i + 1) % clip.length]!;
    const side = (p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j]!;
      const q = input[(j + 1) % input.length]!;
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

// The counter-clockwise corners of a rectangle in the pattern frame, turned and moved to the plan or wall.
const rectRing = (r: Rect, place: (p: Point) => Point): Point[] => [
  place({ x: r.x0, y: r.y0 }),
  place({ x: r.x1, y: r.y0 }),
  place({ x: r.x1, y: r.y1 }),
  place({ x: r.x0, y: r.y1 }),
];

// The tile rectangles of the pattern frame that may touch `box` (a box in the same frame).
function frameTiles(spec: TileSpec, box: Rect, limit: number): Rect[] | null {
  const { tileWidth: w, tileHeight: h, joint: g } = spec;
  const out: Rect[] = [];
  if (spec.pattern !== 'herringbone') {
    const pw = w + g;
    const ph = h + g;
    const i0 = Math.floor(box.x0 / pw) - 1;
    const i1 = Math.ceil(box.x1 / pw);
    const j0 = Math.floor(box.y0 / ph) - 1;
    const j1 = Math.ceil(box.y1 / ph);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > limit) return null;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        out.push({ x0: i * pw, y0: j * ph, x1: i * pw + w, y1: j * ph + h });
    return out;
  }
  // Herringbone, before the turn: the long side L, the short side S; cells Lc = L + g, Sc = S + g. Cell origin
  // o = k(Sc, Sc) + m(Lc, -Lc). The horizontal tile is [0, L] x [0, S] from o; the vertical one [-Sc, -Sc + S] x
  // [0, L]. The two cells tile the plane: the pair covers 2 Lc Sc, the area the two steps span.
  const L = Math.max(w, h);
  const S = Math.min(w, h);
  const Lc = L + g;
  const Sc = S + g;
  const corners = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
  const ks = corners.map((p) => (p.x + p.y) / (2 * Sc));
  const ms = corners.map((p) => (p.x - p.y) / (2 * Lc));
  const k0 = Math.floor(Math.min(...ks)) - 2;
  const k1 = Math.ceil(Math.max(...ks)) + 2;
  const m0 = Math.floor(Math.min(...ms)) - 2;
  const m1 = Math.ceil(Math.max(...ms)) + 2;
  if ((k1 - k0 + 1) * (m1 - m0 + 1) * 2 > limit * 4) return null;
  for (let k = k0; k <= k1; k++)
    for (let m = m0; m <= m1; m++) {
      const ox = k * Sc + m * Lc;
      const oy = k * Sc - m * Lc;
      const hz = { x0: ox, y0: oy, x1: ox + L, y1: oy + S };
      const vt = { x0: ox - Sc, y0: oy, x1: ox - Sc + S, y1: oy + L };
      for (const r of [hz, vt])
        if (r.x1 > box.x0 && r.x0 < box.x1 && r.y1 > box.y0 && r.y0 < box.y1) out.push(r);
    }
  return out.length > limit ? null : out;
}

// The pieces of `spec` laid from `start` over `region` (a closed outline in plan or wall inches).
export function tilePieces(
  region: readonly Point[],
  spec: TileSpec,
  start: Point,
  limit: number = MAX_TILE_PIECES,
): TilePieces {
  if (region.length < 3 || !(spec.tileWidth > 0) || !(spec.tileHeight > 0))
    return { pieces: [], tooMany: false };
  // The turn: diagonal +45 degrees; herringbone -45 so its zig-zag (along (1, 1) before) runs along x.
  const turn = spec.pattern === 'diagonal' ? 1 : spec.pattern === 'herringbone' ? -1 : 0;
  const c = turn === 0 ? 1 : ROOT_HALF;
  const s = turn * ROOT_HALF;
  const place = (p: Point): Point => ({
    x: start.x + p.x * c - p.y * s,
    y: start.y + p.x * s + p.y * c,
  });
  const unplace = (p: Point): Point => {
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    return { x: dx * c + dy * s, y: -dx * s + dy * c };
  };
  const local = region.map(unplace);
  const box: Rect = {
    x0: Math.min(...local.map((p) => p.x)),
    y0: Math.min(...local.map((p) => p.y)),
    x1: Math.max(...local.map((p) => p.x)),
    y1: Math.max(...local.map((p) => p.y)),
  };
  const tiles = frameTiles(spec, box, limit);
  if (tiles === null) return { pieces: [], tooMany: true };
  const whole = spec.tileWidth * spec.tileHeight;
  const pieces: TilePiece[] = [];
  for (const t of tiles) {
    if (t.x1 <= box.x0 || t.x0 >= box.x1 || t.y1 <= box.y0 || t.y0 >= box.y1) continue;
    const ring = rectRing(t, place);
    const piece = clipToConvex(region, ring);
    if (piece.length < 3) continue;
    const a = Math.abs(area(piece));
    if (a <= AREA_TOLERANCE) continue;
    pieces.push({ points: piece, cut: a < whole - AREA_TOLERANCE });
    if (pieces.length > limit) return { pieces: [], tooMany: true };
  }
  return { pieces, tooMany: false };
}

// The area of a piece, for tests and callers that sum them.
export const tilePieceArea = (p: TilePiece): number => Math.abs(area(p.points));
