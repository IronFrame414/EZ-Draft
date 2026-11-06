// EZD-205a Build step 4 (vault/plans/EZD-205a.md section 3, Decided "Area", "pointInRing", "interiorPoint",
// "sameBoundary", "roomLabelText", "Empty and degenerate input"; Q-0207; Q-0568; Q-0570; 03g; 09j Room area): room
// area in whole square feet, an inside point and the boundary compare. Area is derived, never stored.
import type { Point } from '../schema';
import { pointsEqual } from '../tolerance';

// Shoelace / 2 in square inches; counter-clockwise is positive. Fewer than 3 points → 0.
export function ringSignedAreaSqIn(ring: readonly Point[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let twice = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    twice += p.x * q.y - q.x * p.y;
  }
  return twice / 2;
}

export function outlineAreaSqIn(boundary: readonly Point[]): number {
  return Math.abs(ringSignedAreaSqIn(boundary));
}

// Added before rounding so float noise in the shoelace sum cannot drop an exact half (Q-0568); far below a 1/64"
// square (03g), so no real area moves.
const AREA_ROUNDING_MARGIN_SQ_IN = 1e-6;

// Whole square feet, halves up (Q-0568).
export function roomAreaSqFt(boundary: readonly Point[]): number {
  if (boundary.length < 3) return 0;
  return Math.floor((outlineAreaSqIn(boundary) + 72 + AREA_ROUNDING_MARGIN_SQ_IN) / 144);
}

// The half-open crossing rule both `pointInRing` and `interiorPoint` use: edge (a, b) crosses the horizontal line
// at `y` when exactly one end is above it.
const crossesY = (a: Point, b: Point, y: number) => a.y > y !== b.y > y;
const crossingX = (a: Point, b: Point, y: number) => a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);

// Even-odd rule.
export function pointInRing(p: Point, ring: readonly Point[]): boolean {
  const n = ring.length;
  let inside = false;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    if (crossesY(a, b, p.y) && p.x < crossingX(a, b, p.y)) inside = !inside;
  }
  return inside;
}

function centroid(ring: readonly Point[]): Point {
  const n = ring.length;
  const area = ringSignedAreaSqIn(ring);
  if (area === 0) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

// The area centroid when it is inside; else the middle of the widest inside run across the ring at the centroid's
// height (the first on a tie); else the centroid.
export function interiorPoint(ring: readonly Point[]): Point {
  const n = ring.length;
  if (n === 0) return { x: 0, y: 0 };
  const c = centroid(ring);
  if (pointInRing(c, ring)) return c;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    if (crossesY(a, b, c.y)) xs.push(crossingX(a, b, c.y));
  }
  if (xs.length === 0) return c;
  xs.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const lo = xs[i]!;
    const hi = xs[i + 1]!;
    if (best === null || hi - lo > best[1] - best[0]) best = [lo, hi];
  }
  if (best === null) return c;
  return { x: (best[0] + best[1]) / 2, y: c.y };
}

// The same points in the same cyclic order, from any start and in either direction, each within 1/64".
export function sameBoundary(a: readonly Point[], b: readonly Point[]): boolean {
  const n = a.length;
  if (n !== b.length) return false;
  if (n === 0) return true;
  for (let k = 0; k < n; k++) {
    for (const d of [1, -1]) {
      let all = true;
      for (let i = 0; i < n; i++) {
        if (!pointsEqual(a[i]!, b[(((k + d * i) % n) + n) % n]!)) {
          all = false;
          break;
        }
      }
      if (all) return true;
    }
  }
  return false;
}

// `NAME \u00b7 N SF`: the name in capitals (never the locale form), N whole square feet grouped by commas.
export function roomLabelText(name: string, boundary: readonly Point[]): string {
  const n = String(roomAreaSqFt(boundary)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${name.toUpperCase()} \u00b7 ${n} SF`;
}
