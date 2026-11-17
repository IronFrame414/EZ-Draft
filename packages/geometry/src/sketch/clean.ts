// EZD-223 (S03 Sketch; AC-EZD-223-1, -2): a freehand stroke cleans up to a line, arc, circle or rectangle, or stays
// raw when it is none of these. Pure; points are model inches. Every threshold is a share of the stroke's own size,
// so the same hand-drawn shape cleans the same way at any zoom (vault/build/assumptions.md EZD-223).
import type { Point } from '../schema/common';
import type { SketchShape } from './shape';

// A stroke whose ends are closer than this share of its length is closed.
export const SKETCH_CLOSED_SHARE = 0.2;
// A line: no point farther from the end-to-end chord than this share of the chord.
export const SKETCH_LINE_SHARE = 0.06;
// An arc or circle: no point farther from the fitted circle than this share of its radius.
export const SKETCH_ROUND_SHARE = 0.12;
// An arc must bend: its sagitta is at least this share of its chord (else it is a line or nothing).
export const SKETCH_ARC_MIN_BEND = 0.08;
// Corners: the simplify tolerance as a share of the bounding diagonal, and how far from 90° a corner may be.
export const SKETCH_CORNER_SHARE = 0.06;
export const SKETCH_RIGHT_ANGLE_DEG = 20;

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(points: readonly Point[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += dist(points[i - 1]!, points[i]!);
  return l;
}

function distToLine(p: Point, a: Point, b: Point): number {
  const d = dist(a, b);
  if (d === 0) return dist(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / d;
}

// Least-squares circle (Kasa fit). Null when the points are collinear.
export function fitCircle(points: readonly Point[]): { center: Point; radius: number } | null {
  const n = points.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const p of points) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-12 * Math.max(1, suu * svv)) return null;
  const c1 = (suuu + suvv) / 2;
  const c2 = (svvv + svuu) / 2;
  const uc = (c1 * svv - c2 * suv) / det;
  const vc = (c2 * suu - c1 * suv) / det;
  const radius = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return { center: { x: uc + mx, y: vc + my }, radius };
}

function roundFit(points: readonly Point[]): { center: Point; radius: number } | null {
  const fit = fitCircle(points);
  if (fit === null || !Number.isFinite(fit.radius) || fit.radius <= 0) return null;
  for (const p of points) {
    if (Math.abs(dist(p, fit.center) - fit.radius) > SKETCH_ROUND_SHARE * fit.radius) return null;
  }
  return fit;
}

// Ramer-Douglas-Peucker on an open run, keeping both ends.
function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) return [...points];
  const a = points[0]!;
  const b = points[points.length - 1]!;
  let far = 0;
  let at = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToLine(points[i]!, a, b);
    if (d > far) {
      far = d;
      at = i;
    }
  }
  if (at < 0 || far <= tolerance) return [a, b];
  const left = simplify(points.slice(0, at + 1), tolerance);
  const right = simplify(points.slice(at), tolerance);
  return [...left.slice(0, -1), ...right];
}

const turnDeg = (prev: Point, at: Point, next: Point): number => {
  const u = sub(at, prev);
  const v = sub(next, at);
  const cross = u.x * v.y - u.y * v.x;
  const dot = u.x * v.x + u.y * v.y;
  return (Math.atan2(cross, dot) * 180) / Math.PI;
};

// The corners of a closed stroke: simplified, with near-straight vertices dropped.
function closedCorners(points: readonly Point[], tolerance: number): Point[] {
  const start = points[0]!;
  let farAt = 0;
  for (let i = 1; i < points.length; i++) {
    if (dist(points[i]!, start) > dist(points[farAt]!, start)) farAt = i;
  }
  const loop = [...points, start];
  const one = simplify(loop.slice(0, farAt + 1), tolerance);
  const two = simplify(loop.slice(farAt), tolerance);
  let ring = [...one.slice(0, -1), ...two.slice(0, -1)];
  // Drop vertices that barely turn, until none are left to drop.
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const prev = ring[(i + ring.length - 1) % ring.length]!;
      const next = ring[(i + 1) % ring.length]!;
      const at = ring[i]!;
      if (Math.abs(turnDeg(prev, at, next)) < 90 - 2 * SKETCH_RIGHT_ANGLE_DEG || dist(prev, at) < tolerance) {
        ring = ring.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return ring;
}

function rectangleOf(corners: readonly Point[], points: readonly Point[]): SketchShape | null {
  if (corners.length !== 4) return null;
  const turns = corners.map((at, i) =>
    turnDeg(corners[(i + 3) % 4]!, at, corners[(i + 1) % 4]!),
  );
  const sign = Math.sign(turns[0]!);
  if (turns.some((t) => Math.sign(t) !== sign || Math.abs(Math.abs(t) - 90) > SKETCH_RIGHT_ANGLE_DEG))
    return null;
  // The rectangle's direction: the mean of the four edge directions folded into one quarter turn.
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < 4; i++) {
    const e = sub(corners[(i + 1) % 4]!, corners[i]!);
    const a = Math.atan2(e.y, e.x) * 4;
    const w = Math.hypot(e.x, e.y);
    cx += Math.cos(a) * w;
    cy += Math.sin(a) * w;
  }
  const theta = Math.atan2(cy, cx) / 4;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const local = corners.map((p) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
  const xs = local.map((p) => p.x).sort((a, b) => a - b);
  const ys = local.map((p) => p.y).sort((a, b) => a - b);
  const rough = [(xs[0]! + xs[1]!) / 2, (xs[2]! + xs[3]!) / 2, (ys[0]! + ys[1]!) / 2, (ys[2]! + ys[3]!) / 2];
  // Each side sits at the mean of the stroke points nearest it (away from the corners), so the wobble averages out.
  const sums = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  const margin = 0.15 * Math.min(rough[1]! - rough[0]!, rough[3]! - rough[2]!);
  for (const p of points) {
    const x = p.x * c + p.y * s;
    const y = -p.x * s + p.y * c;
    const gaps = [Math.abs(x - rough[0]!), Math.abs(x - rough[1]!), Math.abs(y - rough[2]!), Math.abs(y - rough[3]!)];
    const side = gaps.indexOf(Math.min(...gaps));
    const along = side < 2 ? y : x;
    const lo = side < 2 ? rough[2]! : rough[0]!;
    const hi = side < 2 ? rough[3]! : rough[1]!;
    if (along < lo + margin || along > hi - margin) continue;
    sums[side]! += side < 2 ? x : y;
    counts[side]! += 1;
  }
  const [x0, x1, y0, y1] = rough.map((r, i) => (counts[i]! > 0 ? sums[i]! / counts[i]! : r)) as [
    number,
    number,
    number,
    number,
  ];
  const back = (x: number, y: number): Point => ({ x: x * c - y * s, y: x * s + y * c });
  return {
    kind: 'rectangle',
    corners: [back(x0, y0), back(x1, y0), back(x1, y1), back(x0, y1)],
  };
}

function arcOf(points: readonly Point[]): SketchShape | null {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const chord = dist(first, last);
  let bend = 0;
  for (const p of points) bend = Math.max(bend, distToLine(p, first, last));
  if (chord === 0 || bend < SKETCH_ARC_MIN_BEND * chord) return null;
  const fit = roundFit(points);
  if (fit === null) return null;
  const angle = (p: Point) => Math.atan2(p.y - fit.center.y, p.x - fit.center.x);
  let sweep = 0;
  for (let i = 1; i < points.length; i++) {
    let d = angle(points[i]!) - angle(points[i - 1]!);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    sweep += d;
  }
  return { kind: 'arc', center: fit.center, radius: fit.radius, start: angle(first), sweep };
}

// The cleaned shape of one stroke. Fewer than two distinct points, or a shape none of the rules fit, stays raw.
export function cleanStroke(points: readonly Point[]): SketchShape {
  const raw: SketchShape = { kind: 'raw', points: [...points] };
  if (points.length < 2) return raw;
  const length = pathLength(points);
  if (length === 0) return raw;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const closed = dist(first, last) <= SKETCH_CLOSED_SHARE * length;
  if (!closed) {
    const chord = dist(first, last);
    let far = 0;
    for (const p of points) far = Math.max(far, distToLine(p, first, last));
    if (far <= SKETCH_LINE_SHARE * chord) return { kind: 'line', from: first, to: last };
    return arcOf(points) ?? raw;
  }
  const circle = roundFit(points);
  if (circle !== null) return { kind: 'circle', center: circle.center, radius: circle.radius };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  return rectangleOf(closedCorners(points, SKETCH_CORNER_SHARE * diagonal), points) ?? raw;
}
