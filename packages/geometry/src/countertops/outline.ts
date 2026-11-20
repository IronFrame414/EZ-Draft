// EZD-412 (S04b Controls "Draw outline | Canvas tool bar | Click points to draw a custom top shape; typed lengths |
// Snaps as in 03", "Drag outline vertex | Canvas | Reshape custom outline", "Seam | ... Pieces relabel (A, B, C)";
// 03c countertop_piece "label (A/B…)"; vault/build/assumptions.md EZD-412): a drawn countertop outline and the
// piece it makes, piece labels, and a vertex drag. Pure.
import { outlineAreaSqIn } from '../rooms/area';
import type { CountertopEdge, CountertopPieceData, Point } from '../schema';
import { COUNTERTOP_LABEL_PATTERN, COUNTERTOP_OUTLINE_MAX } from '../schema';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The label at place `i` of A … Z, AA, AB … ZZ.
export function countertopLabelAt(i: number): string {
  if (i < 26) return LETTERS[i]!;
  const j = i - 26;
  return LETTERS[Math.floor(j / 26) % 26]! + LETTERS[j % 26]!;
}

// The first `count` labels in order that are not in `used` (case as stored: capitals).
export function nextCountertopLabels(used: readonly string[], count: number): string[] {
  const taken = new Set(used);
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 26 + 26 * 26; i++) {
    const l = countertopLabelAt(i);
    if (!taken.has(l)) out.push(l);
  }
  return out;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// A closed outline a piece can take: 3 to COUNTERTOP_OUTLINE_MAX corners, some area, no side crossing another.
export function isValidCountertopOutline(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 3 || n > COUNTERTOP_OUTLINE_MAX) return false;
  if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
  if (!(outlineAreaSqIn(points) > 1e-6)) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!))
        return false;
    }
  }
  return true;
}

// A drawn outline: the corners clicked so far. A click on the first corner closes it (with 3 or more corners).
export type CountertopOutlineDraft = { points: Point[] };

export type OutlineClick =
  | { kind: 'added'; draft: CountertopOutlineDraft }
  | { kind: 'closed'; points: Point[] }
  | { kind: 'ignored'; draft: CountertopOutlineDraft };

// `closeWithin` is how near the first corner a click closes the outline (inches; the screen passes its pick radius).
export function outlineClick(
  draft: CountertopOutlineDraft,
  p: Point,
  closeWithin: number,
): OutlineClick {
  const pts = draft.points;
  if (pts.length >= 3 && dist(p, pts[0]!) <= closeWithin) {
    return isValidCountertopOutline(pts)
      ? { kind: 'closed', points: [...pts] }
      : { kind: 'ignored', draft };
  }
  const last = pts[pts.length - 1];
  if (last !== undefined && dist(p, last) <= 1e-9) return { kind: 'ignored', draft };
  if (pts.length >= COUNTERTOP_OUTLINE_MAX) return { kind: 'ignored', draft };
  return { kind: 'added', draft: { points: [...pts, p] } };
}

// A typed length: the next corner is that far from the last one, toward `toward` (the pointer). Null with no corner
// yet, a length that is not positive, or the pointer on the last corner.
export function outlineTypedPoint(
  draft: CountertopOutlineDraft,
  length: number,
  toward: Point,
): Point | null {
  const last = draft.points[draft.points.length - 1];
  if (last === undefined || !(length > 0)) return null;
  const d = dist(toward, last);
  if (!(d > 1e-9)) return null;
  return {
    x: last.x + ((toward.x - last.x) / d) * length,
    y: last.y + ((toward.y - last.y) / d) * length,
  };
}

// Snap for the outline tool, as the plan's drawing tools (S03): a corner of the cabinets or of another top within
// `radius`; otherwise, from the last corner, the direction to the nearest 15° and the length to `increment` (the
// Defaults countertop increment); with no last corner, the point to the `increment` grid.
export const OUTLINE_ANGLE_STEP_DEG = 15;

export function snapOutlinePoint(
  p: Point,
  o: { targets: readonly Point[]; last: Point | null; increment: number | null; radius: number },
): Point {
  let best: Point | null = null;
  let bestD = o.radius;
  for (const t of o.targets) {
    const d = dist(p, t);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  if (best !== null) return { x: best.x, y: best.y };
  const inc = o.increment !== null && o.increment > 0 ? o.increment : null;
  const round = (n: number) => (inc === null ? n : Math.round(n / inc) * inc);
  if (o.last === null) return { x: round(p.x), y: round(p.y) };
  const dx = p.x - o.last.x;
  const dy = p.y - o.last.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return { x: o.last.x, y: o.last.y };
  const step = (OUTLINE_ANGLE_STEP_DEG * Math.PI) / 180;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  const l = round(len);
  const clean = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n);
  return { x: o.last.x + clean(Math.cos(a)) * l, y: o.last.y + clean(Math.sin(a)) * l };
}

// The piece a drawn outline makes. A custom shape has no cabinets under it to measure from, so every edge is exposed
// with no overhang; the overhang and edge type are set per edge afterwards (EZD-414).
export function countertopFromOutline(
  points: readonly Point[],
  o: { level: string; label: string; thickness: number; name?: string },
): CountertopPieceData | null {
  if (!isValidCountertopOutline(points) || !COUNTERTOP_LABEL_PATTERN.test(o.label)) return null;
  const edge: CountertopEdge = {
    kind: 'exposed',
    overhang: 0,
    backsplashHeight: null,
    profileId: null,
  };
  return {
    geometry: { outline: points.map((p) => ({ x: p.x, y: p.y })) },
    status: 'new',
    level: o.level,
    attributes: {
      label: o.label,
      name: o.name ?? '',
      materialItemId: null,
      thickness: o.thickness,
      edges: points.map(() => ({ ...edge })),
    },
  };
}

// Corner `index` moved to `to`; null when the index is not a corner or the outline it leaves is not valid. The edges
// keep their kinds and overhangs.
export function moveCountertopVertex(
  piece: CountertopPieceData,
  index: number,
  to: Point,
): CountertopPieceData | null {
  const { outline } = piece.geometry;
  if (!Number.isInteger(index) || index < 0 || index >= outline.length) return null;
  const next = outline.map((p, i) => (i === index ? { x: to.x, y: to.y } : p));
  if (!isValidCountertopOutline(next)) return null;
  return { ...piece, geometry: { ...piece.geometry, outline: next } };
}
