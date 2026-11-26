// EZD-216 (09-calculations Q-0664 "Dimensions": two points equal within 1/64" place nothing, no 200' limit, angular
// dimensions in whole degrees rounded half up; S03 Data shown "at 1/2" display precision"; 03g; 05 Q-0682; 09m
// Dimensions rows 1 to 8): what a dimension measures and the text it shows. Pure.
//
// A linear dimension measures between two base points; its line sits `offset` inches out along the outward normal:
// - `points`: from -> to, outward is the left normal walking from -> to;
// - `wall_face`: the wall's face line (left or right of start -> end, `wallFaceOffsets`), outward away from the wall;
// - `auto` x: the box's top edge, minX -> maxX, outward up (+y); `auto` y: its left edge, minY -> maxY, outward left.
// An angular dimension measures the angle between two walls' lines in the sector holding `at`; its arc runs
// through `at` around the lines' crossing.
import { formatLength, PLAN_DISPLAY_DENOMINATOR } from '../length';
import type { DimensionData, Point, WallData } from '../schema';
import { pointsEqual } from '../tolerance';
import { add, cross, dot, sub } from '../vec';
import { wallFaceOffsets } from '../walls/wall';

export type DimensionObject = { id: string; type: 'dimension'; data: DimensionData };
export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export type LinearMeasure = {
  kind: 'linear';
  /** The measured points. */
  from: Point;
  to: Point;
  /** The unit outward normal; the dimension line is at from/to + normal × offset. */
  normal: Point;
  length: number;
};
export type AngularMeasure = {
  kind: 'angular';
  vertex: Point;
  radius: number;
  /** The arc, counter-clockwise from startDeg to endDeg (degrees from +x). */
  startDeg: number;
  endDeg: number;
  degrees: number;
};
export type DimensionMeasure = LinearMeasure | AngularMeasure;

/** What a dimension reads: its walls, and the auto boxes (a room's inside box, a floor's outer wall extents). */
export type DimensionLookup = {
  wall(id: string): { data: WallData } | null;
  roomBox(roomId: string): Box | null;
  floorBox(level: string): Box | null;
};

/** Whole degrees, halfway rounded up (Q-0664; 09m rows 5 to 7). */
export function formatAngle(degrees: number): string {
  return `${Math.floor(degrees + 0.5)}°`;
}

/** A length at the plan's 1/2" display precision (Q-0207; S03 Data shown). No 200' limit (Q-0664). */
export function formatDimensionLength(inches: number): string {
  return formatLength(inches, PLAN_DISPLAY_DENOMINATOR);
}

export function measuredText(m: DimensionMeasure): string {
  return m.kind === 'linear' ? formatDimensionLength(m.length) : formatAngle(m.degrees);
}

/** The text shown: the override when set, else the measured value. */
export function dimensionText(d: DimensionData, m: DimensionMeasure): string {
  return d.attributes.override ?? measuredText(m);
}

/** A two-point linear measure; null when the points are equal within 1/64" (nothing is placed, 03g). */
export function linearMeasure(from: Point, to: Point): LinearMeasure | null {
  if (!Number.isFinite(from.x + from.y + to.x + to.y) || pointsEqual(from, to)) return null;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const normal = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
  return { kind: 'linear', from, to, normal, length };
}

/** The face line of a wall, walked so that its left normal points away from the wall. */
export function wallFaceLine(
  wall: { data: WallData },
  face: 'left' | 'right',
): { from: Point; to: Point } | null {
  const { start, end } = wall.data.geometry;
  const m = linearMeasure(start, end);
  if (m === null) return null;
  const { oL, oR } = wallFaceOffsets(wall);
  if (face === 'left') return { from: add(start, m.normal, oL), to: add(end, m.normal, oL) };
  return { from: add(end, m.normal, oR), to: add(start, m.normal, oR) };
}

export function boxEdge(box: Box, axis: 'x' | 'y'): { from: Point; to: Point } {
  return axis === 'x'
    ? { from: { x: box.minX, y: box.maxY }, to: { x: box.maxX, y: box.maxY } }
    : { from: { x: box.minX, y: box.minY }, to: { x: box.minX, y: box.maxY } };
}

const PARALLEL_EPS = 1e-12;

/** The angle between two lines in the sector holding `at`; null for parallel lines or `at` on the crossing. */
export function angularMeasure(
  a: { start: Point; end: Point },
  b: { start: Point; end: Point },
  at: Point,
): AngularMeasure | null {
  const da0 = sub(a.end, a.start);
  const db0 = sub(b.end, b.start);
  const la = Math.hypot(da0.x, da0.y);
  const lb = Math.hypot(db0.x, db0.y);
  if (!(la > 0) || !(lb > 0)) return null;
  const da = { x: da0.x / la, y: da0.y / la };
  const db = { x: db0.x / lb, y: db0.y / lb };
  const c = cross(da, db);
  if (Math.abs(c) < PARALLEL_EPS) return null;
  // The crossing: a.start + da·t = b.start + db·s.
  const t = cross(sub(b.start, a.start), db) / c;
  const vertex = add(a.start, da, t);
  const w = sub(at, vertex);
  const radius = Math.hypot(w.x, w.y);
  if (!(radius > 0) || pointsEqual(at, vertex)) return null;
  // w = α·da + β·db; the sector holding `at` is between sign(α)·da and sign(β)·db.
  const alpha = cross(w, db) / c;
  const beta = cross(da, w) / c;
  const u1 = alpha >= 0 ? da : { x: -da.x, y: -da.y };
  const u2 = beta >= 0 ? db : { x: -db.x, y: -db.y };
  const degrees = (Math.acos(Math.max(-1, Math.min(1, dot(u1, u2)))) * 180) / Math.PI;
  const deg = (v: Point) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
  const ccw = cross(u1, u2) >= 0;
  return {
    kind: 'angular',
    vertex,
    radius,
    startDeg: deg(ccw ? u1 : u2),
    endDeg: deg(ccw ? u2 : u1),
    degrees,
  };
}

/** What a stored dimension measures now; null when it measures nothing (nothing is drawn). */
export function measureDimension(d: DimensionData, look: DimensionLookup): DimensionMeasure | null {
  const g = d.geometry;
  if (g.kind === 'points') return linearMeasure(g.from, g.to);
  if (g.kind === 'wall_face') {
    const wall = look.wall(g.wallId);
    const line = wall === null ? null : wallFaceLine(wall, g.face);
    return line === null ? null : linearMeasure(line.from, line.to);
  }
  if (g.kind === 'walls') {
    const a = look.wall(g.wallIds[0]);
    const b = look.wall(g.wallIds[1]);
    if (a === null || b === null) return null;
    return angularMeasure(a.data.geometry, b.data.geometry, g.at);
  }
  const box =
    d.attributes.auto === 'room' && d.attributes.room !== null
      ? look.roomBox(d.attributes.room)
      : d.attributes.auto === 'overall'
        ? look.floorBox(d.level)
        : null;
  if (box === null) return null;
  const edge = boxEdge(box, g.axis);
  return linearMeasure(edge.from, edge.to);
}

/** The dimension line's ends for a linear measure at `offset`. */
export function dimensionLine(m: LinearMeasure, offset: number): { from: Point; to: Point } {
  return { from: add(m.from, m.normal, offset), to: add(m.to, m.normal, offset) };
}

/** The offset that puts a linear dimension's line through `p` (a drag, or the tool's third click). */
export function offsetThrough(m: LinearMeasure, p: Point): number {
  return dot(sub(p, m.from), m.normal);
}
