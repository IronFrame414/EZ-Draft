// EZD-413 (S04b Controls "Seam | Canvas tool bar | Click across a piece to split it; seam drawn red dashed | Pieces
// relabel (A, B, C)"; S04b footer totals "pieces, seams"; AC-EZD-413-1 "A seam yields two relabeled pieces";
// vault/build/assumptions.md EZD-413): where a seam runs across a piece, the two pieces a seam makes, the seams to
// draw and count, and the label order after a split. Pure.
import { outlineAreaSqIn, pointInRing } from '../rooms/area';
import type { CountertopCutout, CountertopEdge, CountertopPieceData, Point } from '../schema';
import { cutoutCorners } from './cutout';
import { countertopLabelAt, isValidCountertopOutline } from './outline';
import { add, cross, dist, dot, sub } from '../vec';

const EPS = 1e-6;

const clean = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n);
const tidy = (p: Point): Point => ({ x: clean(p.x), y: clean(p.y) });

function signedArea(ring: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) s += cross(ring[i]!, ring[(i + 1) % ring.length]!);
  return s / 2;
}

function distToSegment(p: Point, a: Point, b: Point): { d: number; t: number } {
  const e = sub(b, a);
  const len2 = dot(e, e);
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), e) / len2));
  return { d: dist(p, add(a, e, t)), t };
}

// A seam across a piece: the straight cut from `a` to `b`, both on the outline.
export type SeamChord = { a: Point; b: Point };

// The seam a click at `at` makes: square to the nearest side of the outline, from that side across the piece to the
// first side it meets. Its place along the nearest side is measured from that side's first corner and rounded to
// `increment` (the Defaults countertop increment; null or 0 leaves it where clicked). Null when the click is off the
// piece or the cut would not cross it.
export function seamChordAt(
  outline: readonly Point[],
  at: Point,
  increment: number | null,
): SeamChord | null {
  const n = outline.length;
  if (n < 3 || !pointInRing(at, outline)) return null;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const { d } = distToSegment(at, outline[i]!, outline[(i + 1) % n]!);
    if (d < bestD - EPS) {
      best = i;
      bestD = d;
    }
  }
  const p = outline[best]!;
  const q = outline[(best + 1) % n]!;
  const len = dist(p, q);
  if (!(len > EPS)) return null;
  const u = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
  let t = dot(sub(at, p), u);
  if (increment !== null && increment > 0) t = Math.round(t / increment) * increment;
  t = Math.max(0, Math.min(len, t));
  // Into the piece: left of a side on a counter-clockwise outline, right on a clockwise one.
  const ccw = signedArea(outline) > 0;
  const into = ccw ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  const a = tidy(add(p, u, t));
  let s = Infinity;
  for (let j = 0; j < n; j++) {
    const c = outline[j]!;
    const d = outline[(j + 1) % n]!;
    const e = sub(d, c);
    const ac = sub(c, a);
    const den = cross(into, e);
    if (Math.abs(den) < EPS) {
      // A side along the cut: it meets the cut at its nearer end.
      if (Math.abs(cross(ac, into)) < EPS) {
        for (const k of [dot(ac, into), dot(sub(d, a), into)]) if (k > EPS && k < s) s = k;
      }
      continue;
    }
    const k = cross(ac, e) / den;
    const w = cross(ac, into) / den;
    if (w >= -EPS && w <= 1 + EPS && k > EPS && k < s) s = k;
  }
  if (!Number.isFinite(s)) return null;
  const b = tidy(add(a, into, s));
  if (!pointInRing({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, outline)) return null;
  return { a, b };
}

type Spot = { vertex: number } | { edge: number; w: number };

function locate(outline: readonly Point[], p: Point): Spot | null {
  const n = outline.length;
  for (let i = 0; i < n; i++) if (dist(outline[i]!, p) < EPS) return { vertex: i };
  for (let i = 0; i < n; i++) {
    const { d, t } = distToSegment(p, outline[i]!, outline[(i + 1) % n]!);
    if (d < EPS) return { edge: i, w: t };
  }
  return null;
}

function segmentsMeet(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => cross(sub(q, p), sub(r, p));
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 <= 0 && d3 * d4 <= 0 && !(d1 === 0 && d2 === 0);
}

// Whether the seam runs through a cutout (a seam is never placed through a sink or cooktop hole).
export function seamCrossesCutout(chord: SeamChord, cutout: CountertopCutout): boolean {
  const cs = cutoutCorners(cutout);
  if (pointInRing({ x: (chord.a.x + chord.b.x) / 2, y: (chord.a.y + chord.b.y) / 2 }, cs))
    return true;
  for (let i = 0; i < 4; i++) if (segmentsMeet(chord.a, chord.b, cs[i]!, cs[(i + 1) % 4]!)) return true;
  return false;
}

// The edge a seam makes on each piece: a joint, as Trace's joints (kind wall, no overhang, no splash, no profile),
// marked with the seam's id.
export const seamEdge = (seamId: string): CountertopEdge => ({
  kind: 'wall',
  overhang: 0,
  backsplashHeight: null,
  profileId: null,
  seamId,
});

// The two pieces a seam along `chord` makes, larger first. Each side cut by the seam becomes two sides that keep its
// kind, overhang, splash and profile; the cut itself is a seam edge on both pieces. Cutouts go to the piece they
// sit on. Both pieces keep the name, material, thickness, level and status; labels are set by the caller. Null
// when the chord does not cut the piece in two or runs through a cutout.
export function splitCountertopPiece(
  piece: CountertopPieceData,
  chord: SeamChord,
  seamId: string,
): [CountertopPieceData, CountertopPieceData] | null {
  const { outline } = piece.geometry;
  const { edges } = piece.attributes;
  const cutouts = piece.attributes.cutouts ?? [];
  if (cutouts.some((c) => seamCrossesCutout(chord, c))) return null;
  const sa = locate(outline, chord.a);
  const sb = locate(outline, chord.b);
  if (sa === null || sb === null) return null;

  // The outline with the seam's ends put in, each new corner carrying the side it cuts.
  const ring: { p: Point; e: CountertopEdge; tag: 'a' | 'b' | null }[] = [];
  outline.forEach((p, i) => {
    ring.push({
      p,
      e: edges[i]!,
      tag:
        'vertex' in sa && sa.vertex === i ? 'a' : 'vertex' in sb && sb.vertex === i ? 'b' : null,
    });
    const ins: { w: number; tag: 'a' | 'b'; p: Point }[] = [];
    if ('edge' in sa && sa.edge === i) ins.push({ w: sa.w, tag: 'a', p: chord.a });
    if ('edge' in sb && sb.edge === i) ins.push({ w: sb.w, tag: 'b', p: chord.b });
    ins.sort((x, y) => x.w - y.w);
    for (const x of ins) ring.push({ p: x.p, e: { ...edges[i]! }, tag: x.tag });
  });
  const ia = ring.findIndex((r) => r.tag === 'a');
  const ib = ring.findIndex((r) => r.tag === 'b');
  if (ia < 0 || ib < 0 || ia === ib) return null;

  const half = (from: number, to: number): { outline: Point[]; edges: CountertopEdge[] } => {
    const pts: Point[] = [];
    const es: CountertopEdge[] = [];
    const m = ring.length;
    for (let k = from; ; k = (k + 1) % m) {
      pts.push({ x: ring[k]!.p.x, y: ring[k]!.p.y });
      if (k === to) {
        es.push(seamEdge(seamId));
        break;
      }
      es.push({ ...ring[k]!.e });
    }
    return { outline: pts, edges: es };
  };
  const h1 = half(ia, ib);
  const h2 = half(ib, ia);
  if (!isValidCountertopOutline(h1.outline) || !isValidCountertopOutline(h2.outline)) return null;
  const area1 = outlineAreaSqIn(h1.outline);
  const area2 = outlineAreaSqIn(h2.outline);
  const whole = outlineAreaSqIn(outline);
  if (Math.abs(area1 + area2 - whole) > EPS * Math.max(1, whole)) return null;

  const make = (h: { outline: Point[]; edges: CountertopEdge[] }): CountertopPieceData => {
    const mine = cutouts.filter((c) => pointInRing(c.center, h.outline)).map((c) => ({ ...c }));
    const attributes = { ...piece.attributes, edges: h.edges };
    if (piece.attributes.cutouts !== undefined) attributes.cutouts = mine;
    return { ...piece, geometry: { ...piece.geometry, outline: h.outline }, attributes };
  };
  const p1 = make(h1);
  const p2 = make(h2);
  return area1 >= area2 ? [p1, p2] : [p2, p1];
}

// Where a label falls in the order A … Z, AA … ZZ; Infinity for a label outside it.
export function countertopLabelRank(label: string): number {
  if (/^[A-Z]$/.test(label)) return label.charCodeAt(0) - 65;
  if (/^[A-Z]{2}$/.test(label))
    return 26 + (label.charCodeAt(0) - 65) * 26 + (label.charCodeAt(1) - 65);
  return Infinity;
}

// Pieces relabel after a seam (S04b "Pieces relabel (A, B, C)"): the pieces of a floor in label order, the piece
// that was split replaced by its two pieces (larger first), then lettered A, B, C … from the start. `order` is the
// keys in label order with the split already put in; returns each key's new label.
export function relabelCountertops(order: readonly string[]): Map<string, string> {
  return new Map(order.map((k, i) => [k, countertopLabelAt(i)]));
}

// One seam line to draw: the id and the cut's two ends.
export type CountertopSeamLine = { seamId: string; a: Point; b: Point };

// Every seam on the pieces, each drawn once (both pieces either side hold the same edge).
export function countertopSeamLines(
  pieces: readonly CountertopPieceData[],
): CountertopSeamLine[] {
  const out: CountertopSeamLine[] = [];
  const seen = new Set<string>();
  const key = (p: Point) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  for (const piece of pieces) {
    const { outline } = piece.geometry;
    piece.attributes.edges.forEach((e, i) => {
      if (e.seamId === undefined) return;
      const a = outline[i]!;
      const b = outline[(i + 1) % outline.length]!;
      const k = [key(a), key(b)].sort().join('|');
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ seamId: e.seamId, a, b });
    });
  }
  return out;
}

// The number of seams on the pieces (S04b footer "3 pieces · 1 seam").
export function countertopSeamCount(pieces: readonly CountertopPieceData[]): number {
  const ids = new Set<string>();
  for (const p of pieces)
    for (const e of p.attributes.edges) if (e.seamId !== undefined) ids.add(e.seamId.toLowerCase());
  return ids.size;
}
