// EZD-206 Build step 5 (vault/plans/EZD-206.md section 1 Decided "Order of work in snap" to "Bad input, snap";
// Q-0570; Q-0569 (a); Q-0584 (a); Q-0585 (a); 09j Snapping): the snap rules. Model inches, +x east, +y north.
import type { Point } from '../schema';
import { pointsEqual } from '../tolerance';
import { wallFaceLines, type WallLine } from '../walls/wall';
import type { WallSnapIndex } from './wall-snap-index';

export const SNAP_KINDS = ['endpoint', 'midpoint', 'face', 'angle', 'increment'] as const;
export type SnapKind = (typeof SNAP_KINDS)[number];

export const SNAP_CAPTURE_PX = 10;
export const SNAP_CAPTURE_DEG = 5;
export const DEFAULT_SNAP_INCREMENT_IN = 0.5;

export type SnapSettings = {
  endpoints: boolean;
  midpoints: boolean;
  faces: boolean;
  angles: boolean;
  increment: boolean;
  incrementIn: number;
};

export const DEFAULT_SNAP_SETTINGS: Readonly<SnapSettings> = Object.freeze({
  endpoints: true,
  midpoints: true,
  faces: true,
  angles: true,
  increment: true,
  incrementIn: DEFAULT_SNAP_INCREMENT_IN,
});

export type SnapRequest = {
  cursor: Point;
  pixelsPerInch: number;
  anchor: Point | null;
  referenceDirection: Point | null;
  excludeIds?: readonly string[];
  settings?: SnapSettings;
};

export type SnapResult = { point: Point; kind: SnapKind | null; wallId: string | null };

type Candidate = { point: Point; dist: number; wallId: string };

const finitePoint = (p: Point | null | undefined): p is Point =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y);

const roundHalfUp = (v: number, inc: number): number => Math.floor(v / inc + 0.5) * inc;

function nearestOnSegment(seg: WallLine, c: Point): Point {
  const dx = seg.end.x - seg.start.x;
  const dy = seg.end.y - seg.start.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - seg.start.x) * dx + (c.y - seg.start.y) * dy) / len2));
  return { x: seg.start.x + t * dx, y: seg.start.y + t * dy };
}

function better(best: Candidate | null, point: Point, wallId: string, cursor: Point): Candidate {
  const dist = Math.hypot(point.x - cursor.x, point.y - cursor.y);
  return !best || dist < best.dist ? { point, dist, wallId } : best;
}

// Exact (cos, sin) of the snapped turn angle m (degrees).
function exactCs(m: number): [number, number] {
  const h = Math.SQRT1_2;
  switch (m) {
    case 0:
      return [1, 0];
    case 45:
      return [h, h];
    case -45:
      return [h, -h];
    case 90:
      return [0, 1];
    case -90:
      return [0, -1];
    case 135:
      return [-h, h];
    case -135:
      return [-h, -h];
    default:
      return [-1, 0];
  }
}

export function snap(index: WallSnapIndex, request: SnapRequest): SnapResult {
  const { cursor, pixelsPerInch } = request;
  if (!Number.isFinite(pixelsPerInch) || pixelsPerInch <= 0 || !finitePoint(cursor)) {
    return { point: { x: cursor.x, y: cursor.y }, kind: null, wallId: null };
  }
  const plain: SnapResult = { point: { x: cursor.x, y: cursor.y }, kind: null, wallId: null };
  const settings = request.settings ?? DEFAULT_SNAP_SETTINGS;
  const anchor = finitePoint(request.anchor) ? request.anchor : null;
  const exclude = new Set(request.excludeIds ?? []);

  const r = SNAP_CAPTURE_PX / pixelsPerInch;
  const ids = index.spatial.query({ minX: cursor.x - r, minY: cursor.y - r, maxX: cursor.x + r, maxY: cursor.y + r });
  let endpoint: Candidate | null = null;
  let midpoint: Candidate | null = null;
  let face: Candidate | null = null;
  for (const id of ids) {
    if (exclude.has(id)) continue;
    const wall = index.getWall(id);
    if (!wall) continue;
    const { start, end } = wall.data.geometry;
    if (settings.endpoints) {
      endpoint = better(endpoint, { x: start.x, y: start.y }, id, cursor);
      endpoint = better(endpoint, { x: end.x, y: end.y }, id, cursor);
    }
    if (settings.midpoints) {
      midpoint = better(midpoint, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, id, cursor);
    }
    if (settings.faces) {
      const faces = wallFaceLines(wall.data);
      face = better(face, nearestOnSegment(faces.left, cursor), id, cursor);
      face = better(face, nearestOnSegment(faces.right, cursor), id, cursor);
    }
  }
  const ranked: Array<[Candidate | null, SnapKind]> = [
    [endpoint, 'endpoint'],
    [midpoint, 'midpoint'],
    [face, 'face'],
  ];
  for (const [cand, kind] of ranked) {
    if (cand && cand.dist * pixelsPerInch <= SNAP_CAPTURE_PX) {
      return { point: { x: cand.point.x, y: cand.point.y }, kind, wallId: cand.wallId };
    }
  }

  const inc = settings.incrementIn;
  const incOn = settings.increment && Number.isFinite(inc) && inc > 0;

  if (!anchor) {
    if (!incOn) return plain;
    return {
      point: { x: roundHalfUp(cursor.x, inc), y: roundHalfUp(cursor.y, inc) },
      kind: 'increment',
      wallId: null,
    };
  }

  if (pointsEqual(cursor, anchor)) return plain;
  const vx = cursor.x - anchor.x;
  const vy = cursor.y - anchor.y;
  const L = Math.hypot(vx, vy);

  const rd = request.referenceDirection;
  const hasRef = finitePoint(rd) && (rd.x !== 0 || rd.y !== 0);
  const rl = hasRef ? Math.hypot(rd.x, rd.y) : 1;
  const ref = hasRef ? { x: rd.x / rl, y: rd.y / rl } : { x: 1, y: 0 };

  let ux = vx / L;
  let uy = vy / L;
  let len = L;
  let kind: SnapKind | null = null;

  if (settings.angles) {
    let delta = ((Math.atan2(vy, vx) - Math.atan2(ref.y, ref.x)) * 180) / Math.PI;
    while (delta > 180) delta -= 360;
    while (delta <= -180) delta += 360;
    const m = Math.round(delta / 45) * 45;
    if (Math.abs(delta - m) <= SNAP_CAPTURE_DEG && !(Math.abs(m) === 180 && hasRef)) {
      const [c, s] = exactCs(m);
      ux = c * ref.x - s * ref.y;
      uy = s * ref.x + c * ref.y;
      len = L * Math.cos(((delta - m) * Math.PI) / 180);
      kind = 'angle';
    }
  }
  if (incOn) {
    len = roundHalfUp(len, inc);
    kind = kind ?? 'increment';
  }
  if (!kind) return plain;
  return { point: { x: anchor.x + ux * len, y: anchor.y + uy * len }, kind, wallId: null };
}
