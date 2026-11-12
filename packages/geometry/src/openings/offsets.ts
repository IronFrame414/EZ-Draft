// EZD-204b Build step 1 (vault/plans/EZD-204b.md section 1, Decided "`d`, `openingSpan`", "openingOnWall",
// "hostCorners", "openingOffsets", "placeAtOffset", "Door across a tee face"; Q-0630 rows 1, 5, 14; Q-0636; Q-0640;
// Q-0641 row 1; 09k On a wall, Offset, Exact fit, Tee; 03g): an opening's span on its wall, the corners that bound
// it, its left and right offsets, and placing an opening at a typed offset. Model inches; 1/64" inclusive compares.
import type { Point } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { findWallJoins, wallFaceLines, wallLength, type WallObject } from '../walls';
import { isVerticalLine, leftEndIsLow, type OpeningObject } from './opening';

const tol = COMPARISON_TOLERANCE_IN;

export type HostCorner = { at: number; wallId: string | null };

export type OpeningOffsets = {
  left: number;
  right: number;
  leftCorner: HostCorner;
  rightCorner: HostCorner;
};

export type PlaceAtOffsetInput = {
  host: WallObject;
  walls: readonly WallObject[];
  openings: readonly OpeningObject[];
  width: number;
  near: Point;
  side: 'left' | 'right';
  offset: number;
  ignoreId: string | null;
};

export type PlaceAtOffsetResult =
  | { ok: true; center: Point }
  | { ok: false; reason: 'invalid_input' | 'past_corner' | 'overlap' };

const lower = (id: string) => id.toLowerCase();

// The first id: the smallest lower-cased id (Q-0595 (a)); the stored case is kept.
function firstId(ids: readonly string[]): string | null {
  let best: string | null = null;
  for (const id of ids) if (best === null || lower(id) < lower(best)) best = id;
  return best;
}

// Unit start->end direction and length of a wall; null when the wall is zero length (1/64").
function direction(w: WallObject): { d: Point; L: number } | null {
  const { start, end } = w.data.geometry;
  const L = wallLength(w.data.geometry);
  if (L <= tol) return null;
  return { d: { x: (end.x - start.x) / L, y: (end.y - start.y) / L }, L };
}

export function openingSpan(
  o: OpeningObject,
  host: WallObject,
): { along: number; lo: number; hi: number; across: number } | null {
  const dir = direction(host);
  if (dir === null) return null;
  const { d } = dir;
  const start = host.data.geometry.start;
  const c = o.data.geometry.center;
  const px = c.x - start.x;
  const py = c.y - start.y;
  const along = px * d.x + py * d.y;
  const across = Math.abs(px * d.y - py * d.x);
  const half = o.data.attributes.width / 2;
  return { along, lo: along - half, hi: along + half, across };
}

export function openingOnWall(o: OpeningObject, wall: WallObject): boolean {
  if (lower(o.data.level) !== lower(wall.data.level)) return false;
  const span = openingSpan(o, wall);
  if (span === null) return false;
  const L = wallLength(wall.data.geometry);
  return span.across <= tol && span.lo >= -tol && span.hi <= L + tol;
}

export function hostCorners(host: WallObject, walls: readonly WallObject[]): HostCorner[] {
  const dir = direction(host);
  if (dir === null) return [];
  const { d, L } = dir;
  const start = host.data.geometry.start;
  const joins = findWallJoins(walls, host.id);
  const endIds = (end: 'start' | 'end') =>
    joins.flatMap((j) =>
      (j.kind === 'corner' || j.kind === 'tee-into') && j.end === end ? [j.otherId] : [],
    );
  const corners: HostCorner[] = [
    { at: 0, wallId: firstId(endIds('start')) },
    { at: L, wallId: firstId(endIds('end')) },
  ];
  const seen = new Set<string>();
  for (const j of joins) {
    if (j.kind !== 'tee-on' && j.kind !== 'cross') continue;
    if (seen.has(lower(j.otherId))) continue;
    seen.add(lower(j.otherId));
    const other = walls.find((w) => lower(w.id) === lower(j.otherId));
    if (other === undefined) continue;
    const faces = wallFaceLines(other.data);
    for (const face of [faces.left, faces.right]) {
      const ex = face.end.x - face.start.x;
      const ey = face.end.y - face.start.y;
      const denom = d.x * ey - d.y * ex;
      if (denom === 0) continue;
      const at = ((face.start.x - start.x) * ey - (face.start.y - start.y) * ex) / denom;
      if (at > tol && at < L - tol) corners.push({ at, wallId: other.id });
    }
  }
  return corners.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    if (a.wallId === b.wallId) return 0;
    if (a.wallId === null) return -1;
    if (b.wallId === null) return 1;
    const x = lower(a.wallId);
    const y = lower(b.wallId);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export function openingOffsets(
  o: OpeningObject,
  host: WallObject,
  walls: readonly WallObject[],
): OpeningOffsets | null {
  if (!openingOnWall(o, host)) return null;
  const span = openingSpan(o, host);
  const dir = direction(host);
  if (span === null || dir === null) return null;
  const corners = hostCorners(host, walls);
  let low = corners[0]!;
  for (const c of corners) if (c.at <= span.lo + tol) low = c;
  const high = corners.find((c) => c.at >= span.hi - tol) ?? corners[corners.length - 1]!;
  const lowDist = Math.max(0, span.lo - low.at);
  const highDist = Math.max(0, high.at - span.hi);
  if (leftEndIsLow(dir.d, isVerticalLine(host.data.geometry))) {
    return { left: lowDist, right: highDist, leftCorner: low, rightCorner: high };
  }
  return { left: highDist, right: lowDist, leftCorner: high, rightCorner: low };
}

export function placeAtOffset(input: PlaceAtOffsetInput): PlaceAtOffsetResult {
  const { host, width, offset, near } = input;
  const invalid: PlaceAtOffsetResult = { ok: false, reason: 'invalid_input' };
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(offset) ||
    !Number.isFinite(near.x) ||
    !Number.isFinite(near.y) ||
    width <= 0 ||
    offset < 0
  )
    return invalid;
  const corners = hostCorners(host, input.walls);
  const dir = direction(host);
  if (corners.length === 0 || dir === null) return invalid;
  const { d, L } = dir;
  const start = host.data.geometry.start;
  const s = Math.min(L, Math.max(0, (near.x - start.x) * d.x + (near.y - start.y) * d.y));
  let i = 0;
  corners.forEach((c, k) => {
    if (c.at <= s) i = k;
  });
  i = Math.min(Math.max(i, 0), corners.length - 2);
  const bayLow = corners[i]!;
  const bayHigh = corners[i + 1]!;
  const fromLow =
    (input.side === 'left') === leftEndIsLow(d, isVerticalLine(host.data.geometry));
  let lo: number;
  let hi: number;
  if (fromLow) {
    lo = bayLow.at + offset;
    hi = lo + width;
    if (hi - bayHigh.at > tol) return { ok: false, reason: 'past_corner' };
  } else {
    hi = bayHigh.at - offset;
    lo = hi - width;
    if (bayLow.at - lo > tol) return { ok: false, reason: 'past_corner' };
  }
  const hostId = lower(host.id);
  const ignore = input.ignoreId === null ? null : lower(input.ignoreId);
  for (const o of input.openings) {
    const h = o.data.geometry.hostWallId;
    if (h === null || lower(h) !== hostId || lower(o.id) === ignore) continue;
    const span = openingSpan(o, host);
    if (span === null) continue;
    if (Math.min(hi, span.hi) - Math.max(lo, span.lo) > tol) return { ok: false, reason: 'overlap' };
  }
  const mid = (lo + hi) / 2;
  return { ok: true, center: { x: start.x + d.x * mid, y: start.y + d.y * mid } };
}
