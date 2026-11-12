// EZD-211a Build step 4 (vault/plans/EZD-211a.md section 1, Decided "swingSideOf", "openingPreview",
// "withOpeningSize", "doorTargetAt", "openingOwnedAt", "Without moving"; Q-0630 09 rows 1, 3; Q-0633 G12; Q-0641
// rows 2, 3; Q-0642 row 1; S03d E): the door and window preview on a wall, its size, and the door's arc, hinge dot
// and owned area. Model inches; 1/64" inclusive compares.
import type { DoorSwing, OpeningData, Point } from '../schema';
import { coordsEqual } from '../tolerance';
import { wallLength, type WallObject } from '../walls';
import { doorSymbol } from './door-symbol';
import {
  autoRoughOpening,
  createOpeningData,
  DEFAULT_DOOR_SIZE,
  DEFAULT_WINDOW_SIZE,
  isVerticalLine,
  leftEndIsLow,
  type OpeningObject,
} from './opening';
import { hostCorners, placeAtOffset } from './offsets';

export const DOOR_TARGET_PX = 22;
export const PRESS_MOVE_PX = 10;

export type OpeningFailure = 'invalid_input' | 'past_corner' | 'overlap';

export type OpeningPreviewInput = {
  kind: 'door' | 'window';
  host: WallObject;
  walls: readonly WallObject[];
  openings: readonly OpeningObject[];
  point: Point;
  width: number;
  flipped: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const degrees = (v: Point): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

export function swingSideOf(host: WallObject, p: Point): DoorSwing {
  const { start: s, end } = host.data.geometry;
  const dx = end.x - s.x;
  const dy = end.y - s.y;
  const c = dx * (p.y - s.y) - dy * (p.x - s.x);
  return c < 0 ? 'right' : 'left';
}

export function openingPreview(
  i: OpeningPreviewInput,
): { ok: true; data: OpeningData } | { ok: false; reason: OpeningFailure } {
  const { host, point, width } = i;
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(width) ||
    width <= 0
  )
    return { ok: false, reason: 'invalid_input' };
  const corners = hostCorners(host, i.walls);
  if (corners.length < 2) return { ok: false, reason: 'invalid_input' };
  const line = host.data.geometry;
  const L = wallLength(line);
  const d = { x: (line.end.x - line.start.x) / L, y: (line.end.y - line.start.y) / L };
  const s = clamp((point.x - line.start.x) * d.x + (point.y - line.start.y) * d.y, 0, L);
  let k = 0;
  corners.forEach((c, j) => {
    if (c.at <= s) k = j;
  });
  k = clamp(k, 0, corners.length - 2);
  const lo = corners[k]!.at;
  const hi = corners[k + 1]!.at;
  const lowOffset = clamp(s - width / 2 - lo, 0, Math.max(0, hi - lo - width));
  const side = leftEndIsLow(d, isVerticalLine(line)) ? 'left' : 'right';
  const r = placeAtOffset({
    host,
    walls: i.walls,
    openings: i.openings,
    width,
    near: point,
    side,
    offset: lowOffset,
    ignoreId: null,
  });
  if (!r.ok) return { ok: false, reason: r.reason };
  const pointed = swingSideOf(host, point);
  const swing: DoorSwing = i.flipped ? (pointed === 'left' ? 'right' : 'left') : pointed;
  const height = i.kind === 'door' ? DEFAULT_DOOR_SIZE.height : DEFAULT_WINDOW_SIZE.height;
  return {
    ok: true,
    data: withOpeningSize(createOpeningData({ kind: i.kind, host, center: r.center, swing }), {
      width,
      height,
    }),
  };
}

export function withOpeningSize(
  data: OpeningData,
  size: { width: number; height: number },
): OpeningData {
  const g = data.geometry;
  const a = data.attributes;
  const auto = a.roughOpeningMode === 'auto';
  return {
    ...data,
    geometry: {
      ...g,
      center: { x: g.center.x, y: g.center.y },
      axis: g.axis === null ? null : { x: g.axis.x, y: g.axis.y },
    },
    attributes: {
      ...a,
      width: size.width,
      height: size.height,
      roughOpening: auto
        ? autoRoughOpening(a.kind, size)
        : { width: a.roughOpening.width, height: a.roughOpening.height },
    },
  };
}

export function doorTargetAt(
  o: OpeningObject,
  host: WallObject | null,
  p: Point,
  tolIn: number,
): 'arc' | 'dot' | null {
  const sym = doorSymbol(o, host);
  if (sym === null) return null;
  const v = { x: p.x - sym.hinge.x, y: p.y - sym.hinge.y };
  const r = Math.hypot(v.x, v.y);
  if (r <= tolIn) return 'dot';
  if (Math.abs(r - sym.radius) <= tolIn) {
    const sweep = (((degrees(v) - sym.startAngle) % 360) + 360) % 360;
    if (sweep <= sym.endAngle - sym.startAngle) return 'arc';
  }
  return null;
}

// Distance from p to the segment a-b.
function segmentDistance(p: Point, a: Point, b: Point): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len2 = ex * ex + ey * ey;
  const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * ex + (p.y - a.y) * ey) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + ex * t), p.y - (a.y + ey * t));
}

export function openingOwnedAt(
  o: OpeningObject,
  host: WallObject | null,
  p: Point,
  ownTolIn: number,
  targetTolIn: number,
): boolean {
  const g = o.data.geometry;
  let d: Point;
  let band: number;
  if (g.hostWallId === null) {
    d = g.axis ?? { x: 1, y: 0 };
    band = 0;
  } else {
    if (host === null || host.id.toLowerCase() !== g.hostWallId.toLowerCase()) return false;
    const { start, end } = host.data.geometry;
    if (coordsEqual(start.x, end.x) && coordsEqual(start.y, end.y)) return false;
    const L = wallLength(host.data.geometry);
    d = { x: (end.x - start.x) / L, y: (end.y - start.y) / L };
    band = host.data.attributes.thickness;
  }
  if (doorTargetAt(o, host, p, targetTolIn) !== null) return true;
  const half = o.data.attributes.width / 2;
  const a = { x: g.center.x - d.x * half, y: g.center.y - d.y * half };
  const b = { x: g.center.x + d.x * half, y: g.center.y + d.y * half };
  if (segmentDistance(p, a, b) <= ownTolIn + band) return true;
  const sym = doorSymbol(o, host);
  if (sym === null) return false;
  const v = { x: p.x - sym.hinge.x, y: p.y - sym.hinge.y };
  return (
    Math.hypot(v.x, v.y) <= sym.radius + ownTolIn &&
    v.x * sym.swingNormal.x + v.y * sym.swingNormal.y >= 0
  );
}
