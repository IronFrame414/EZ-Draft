// EZD-208a Build step 1 (vault/plans/EZD-208a.md section 3 G1-G6; section 1 R2, R7): the pick shape of a wall or an
// opening, its distance to a point, its bounds and the box tests. Model inches, +x east, +y north.
import type { Point } from '../schema';
import type { Rect } from '../snap/spatial-index';
import { coordsEqual, pointsEqual } from '../tolerance';
import { pointInRing } from '../rooms/area';
import { wallFaceLines, type WallObject } from '../walls/wall';
import type { OpeningObject } from '../openings/opening';
import { utilityMark } from '../drawing/build';
import { fixtureOutline, type FixtureObject, type UtilityPointObject } from '../fixtures/fixtures';
import type { TileShowerObject } from '../fixtures/tile-shower';

export type PickShape =
  | { kind: 'quad'; points: readonly [Point, Point, Point, Point]; area: number }
  | { kind: 'bar'; from: Point; to: Point; area: 0 };

function shoelace(points: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    twice += p.x * q.y - q.x * p.y;
  }
  return Math.abs(twice / 2);
}

export function wallPickShape(wall: WallObject): PickShape | null {
  const { start, end } = wall.data.geometry;
  if (pointsEqual(start, end)) return null;
  const { left, right } = wallFaceLines(wall.data);
  const points: [Point, Point, Point, Point] = [left.start, left.end, right.end, right.start];
  return { kind: 'quad', points, area: shoelace(points) };
}

function faceOffsets(host: WallObject): { oL: number; oR: number } {
  const t = host.data.attributes.thickness;
  switch (host.data.attributes.thicknessSide) {
    case 'right':
      return { oL: 0, oR: -t };
    case 'left':
      return { oL: t, oR: 0 };
    case 'center':
      return { oL: t / 2, oR: -t / 2 };
  }
}

export function openingPickShape(o: OpeningObject, host: WallObject | null): PickShape | null {
  const { center, hostWallId, axis } = o.data.geometry;
  const w = o.data.attributes.width;
  if (hostWallId === null) {
    const d = axis ?? { x: 1, y: 0 };
    return {
      kind: 'bar',
      from: { x: center.x - (w / 2) * d.x, y: center.y - (w / 2) * d.y },
      to: { x: center.x + (w / 2) * d.x, y: center.y + (w / 2) * d.y },
      area: 0,
    };
  }
  if (host === null) return null;
  const { start, end } = host.data.geometry;
  if (pointsEqual(start, end)) return null;
  const L = Math.hypot(end.x - start.x, end.y - start.y);
  const d = { x: (end.x - start.x) / L, y: (end.y - start.y) / L };
  const n = { x: -d.y, y: d.x };
  const { oL, oR } = faceOffsets(host);
  const sc = (center.x - start.x) * d.x + (center.y - start.y) * d.y;
  const lo = Math.max(0, sc - w / 2);
  const hi = Math.min(L, sc + w / 2);
  if (lo > hi || coordsEqual(lo, hi)) return null;
  const at = (s: number, o: number): Point => ({
    x: start.x + s * d.x + o * n.x,
    y: start.y + s * d.y + o * n.y,
  });
  return {
    kind: 'quad',
    points: [at(lo, oL), at(hi, oL), at(hi, oR), at(lo, oR)],
    area: (hi - lo) * host.data.attributes.thickness,
  };
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function vertices(shape: PickShape): readonly Point[] {
  return shape.kind === 'quad' ? shape.points : [shape.from, shape.to];
}

function edges(shape: PickShape): [Point, Point][] {
  if (shape.kind === 'bar') return [[shape.from, shape.to]];
  const p = shape.points;
  return [
    [p[0], p[1]],
    [p[1], p[2]],
    [p[2], p[3]],
    [p[3], p[0]],
  ];
}

export function shapeDistance(shape: PickShape, p: Point): number {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return Infinity;
  if (shape.kind === 'quad' && pointInRing(p, shape.points)) return 0;
  let best = Infinity;
  for (const [a, b] of edges(shape)) best = Math.min(best, segmentDistance(p, a, b));
  return best;
}

export function shapeBounds(shape: PickShape): Rect {
  const pts = vertices(shape);
  return {
    minX: Math.min(...pts.map((q) => q.x)),
    minY: Math.min(...pts.map((q) => q.y)),
    maxX: Math.max(...pts.map((q) => q.x)),
    maxY: Math.max(...pts.map((q) => q.y)),
  };
}

function validRect(r: Rect): boolean {
  return (
    Number.isFinite(r.minX) &&
    Number.isFinite(r.minY) &&
    Number.isFinite(r.maxX) &&
    Number.isFinite(r.maxY) &&
    r.minX <= r.maxX &&
    r.minY <= r.maxY
  );
}

const within = (p: Point, r: Rect) =>
  p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

export function shapeInRect(shape: PickShape, rect: Rect): boolean {
  if (!validRect(rect)) return false;
  return vertices(shape).every((p) => within(p, rect));
}

const orient = (a: Point, b: Point, c: Point) =>
  Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));

const onSegment = (a: Point, b: Point, c: Point) =>
  Math.min(a.x, b.x) <= c.x &&
  c.x <= Math.max(a.x, b.x) &&
  Math.min(a.y, b.y) <= c.y &&
  c.y <= Math.max(a.y, b.y);

function segmentsMeet(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

export function shapeTouchesRect(shape: PickShape, rect: Rect): boolean {
  if (!validRect(rect)) return false;
  if (vertices(shape).some((p) => within(p, rect))) return true;
  const corners: Point[] = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];
  if (shape.kind === 'quad' && corners.some((c) => shapeDistance(shape, c) === 0)) return true;
  const rectEdges: [Point, Point][] = corners.map((c, i) => [c, corners[(i + 1) % 4]!]);
  return edges(shape).some(([a, b]) => rectEdges.some(([c, d]) => segmentsMeet(a, b, c, d)));
}

// EZD-234 Build (S03 Select "smallest object under the cursor"): a fixture picks by its outline, a utility point by
// the diamond it draws.
export function fixturePickShape(o: FixtureObject): PickShape {
  const points = fixtureOutline(o.data);
  return { kind: 'quad', points, area: shoelace(points) };
}

// EZD-226 Build: a tile shower picks by its footprint.
export function tileShowerPickShape(o: TileShowerObject): PickShape {
  const [a, b, c, d] = o.data.geometry.footprint as [Point, Point, Point, Point];
  const points: [Point, Point, Point, Point] = [{ ...a }, { ...b }, { ...c }, { ...d }];
  return { kind: 'quad', points, area: shoelace(points) };
}

export function utilityPointPickShape(o: UtilityPointObject): PickShape {
  const points = utilityMark(o.data.geometry.point);
  return { kind: 'quad', points, area: shoelace(points) };
}
