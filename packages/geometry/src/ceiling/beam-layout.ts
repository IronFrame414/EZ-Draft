// EZD-505 (S05 Controls "Beam", "Spacing input", "Count input", "Direction select"; AC-EZD-505-1): the beams of a
// beam set laid out from its room, and the set's pick shape. Pure; model inches, y up. Split from beams.ts by
// EZD-1009 (11 Budgets; EZD-215 precedent): the plan's pick index needs only this part, so the heights, warnings and
// new-set code in beams.ts stay out of the editor's first download. beams.ts re-exports everything here.
//
// The set's frame: the room's ridge line gives the ridge direction; a room with no ridge takes its longest boundary
// edge. Across ridge: each beam runs square to the ridge and the beams are spaced along it. With ridge: each beam
// runs along the ridge and the beams are spaced across it. The span is the room's extent along the spacing axis.
// By spacing: as many beams as whole spacings fit in the span; by count: the span split in equal shares. Either way
// the set is centred on the span, so the end gaps are half a spacing or more (vault/build/assumptions.md EZD-505).
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import type { BeamData, Point, RoomData } from '../schema';
import type { PickShape } from '../selection/shapes';

const tol = COMPARISON_TOLERANCE_IN;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const add = (a: Point, b: Point, k = 1): Point => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const perp = (u: Point): Point => ({ x: -u.y, y: u.x });
function unit(a: Point, b: Point): Point | null {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  return L <= tol ? null : { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
}

/** The room's ridge direction: its ridge line, else its longest boundary edge. */
export function ridgeDirection(room: RoomData): Point {
  const ridge = room.attributes.ceiling?.ridge ?? null;
  const fromRidge = ridge === null ? null : unit(ridge.start, ridge.end);
  if (fromRidge !== null) return fromRidge;
  const b = room.geometry.boundary;
  let best: Point = { x: 1, y: 0 };
  let longest = 0;
  for (let i = 0; i < b.length; i++) {
    const p = b[i]!;
    const q = b[(i + 1) % b.length]!;
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    if (L > longest + tol) {
      longest = L;
      best = unit(p, q) ?? best;
    }
  }
  return best;
}

/** `along`: the direction each beam runs; `across`: the direction the beams are spaced in. */
export function beamFrame(beam: BeamData, room: RoomData): { along: Point; across: Point } {
  const u = ridgeDirection(room);
  return beam.attributes.direction === 'across_ridge'
    ? { along: perp(u), across: u }
    : { along: u, across: perp(u) };
}

export type BeamLine = { from: Point; to: Point };

export type BeamLayout = {
  /** Each beam's centre line, in the order across the span. */
  beams: BeamLine[];
  /** On-centre spacing; with one beam, the span. */
  spacing: number;
  count: number;
  span: number;
  along: Point;
  across: Point;
};

/** The room's extent along `axis`, as [min, max] of the boundary's projections. */
function extent(boundary: readonly Point[], axis: Point): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of boundary) {
    const t = dot(p, axis);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return [lo, hi];
}

/** Where the line { p : p·across = at } crosses the boundary, as [min, max] along `along`; null when it misses. */
function chord(
  boundary: readonly Point[],
  across: Point,
  along: Point,
  at: number,
): [number, number] | null {
  const ts: number[] = [];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i]!;
    const c = boundary[(i + 1) % boundary.length]!;
    const da = dot(a, across) - at;
    const dc = dot(c, across) - at;
    if ((da > 0 && dc > 0) || (da < 0 && dc < 0)) continue;
    if (da === dc) {
      ts.push(dot(a, along), dot(c, along));
      continue;
    }
    const k = da / (da - dc);
    ts.push(dot(a, along) + (dot(c, along) - dot(a, along)) * k);
  }
  if (ts.length < 2) return null;
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  return hi - lo <= tol ? null : [lo, hi];
}

/** The number of beams and their spacing across a span (S05 "Spacing input", "Count input"). */
export function beamCountAndSpacing(
  span: number,
  layout: BeamData['attributes']['layout'],
): { count: number; spacing: number } {
  if (layout.by === 'count') return { count: layout.count, spacing: span / layout.count };
  const count = Math.max(1, Math.floor(span / layout.spacing + 1e-9));
  return { count, spacing: count === 1 && span < layout.spacing ? span : layout.spacing };
}

/** The set's beams on its room's ceiling (plan view; the same for every placement). */
export function beamLayout(beam: BeamData, room: RoomData): BeamLayout {
  const { along, across } = beamFrame(beam, room);
  const boundary = room.geometry.boundary;
  const [lo, hi] = extent(boundary, across);
  const span = hi - lo;
  const { count, spacing } = beamCountAndSpacing(span, beam.attributes.layout);
  const pitch = beam.attributes.layout.by === 'spacing' ? beam.attributes.layout.spacing : spacing;
  const shift = beam.geometry.shift;
  const middle = (lo + hi) / 2 + dot(shift, across);
  const beams: BeamLine[] = [];
  for (let i = 0; i < count; i++) {
    const at = middle + (i - (count - 1) / 2) * (count === 1 ? 0 : pitch);
    const c = chord(boundary, across, along, at);
    if (c === null) continue;
    let [from, to] = c;
    const length = beam.attributes.length;
    if (length !== null) {
      const centre = (from + to) / 2 + dot(shift, along);
      from = centre - length / 2;
      to = centre + length / 2;
    }
    const base = { x: across.x * at, y: across.y * at };
    beams.push({ from: add(base, along, from), to: add(base, along, to) });
  }
  return { beams, spacing, count, span, along, across };
}

/** Each beam's outline in plan: its centre line widened by the beam width. */
export function beamOutlines(beam: BeamData, room: RoomData): [Point, Point, Point, Point][] {
  const { beams, across } = beamLayout(beam, room);
  const h = beam.attributes.width / 2;
  return beams.map((l) => [
    add(l.from, across, -h),
    add(l.to, across, -h),
    add(l.to, across, h),
    add(l.from, across, h),
  ]);
}

/** The set picks by the box around all its beams; null when no beam lands in the room. */
export function beamSetPickShape(beam: BeamData, room: RoomData): PickShape | null {
  const outlines = beamOutlines(beam, room);
  if (outlines.length === 0) return null;
  const { along, across } = beamFrame(beam, room);
  let a0 = Infinity;
  let a1 = -Infinity;
  let c0 = Infinity;
  let c1 = -Infinity;
  for (const p of outlines.flat()) {
    a0 = Math.min(a0, dot(p, along));
    a1 = Math.max(a1, dot(p, along));
    c0 = Math.min(c0, dot(p, across));
    c1 = Math.max(c1, dot(p, across));
  }
  const at = (a: number, c: number): Point => add({ x: along.x * a, y: along.y * a }, across, c);
  return {
    kind: 'quad',
    points: [at(a0, c0), at(a1, c0), at(a1, c1), at(a0, c1)],
    area: (a1 - a0) * (c1 - c0),
  };
}
