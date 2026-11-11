// EZD-212a Build step 7 (vault/plans/EZD-212a.md section 1, Decided "Wall chips", "Opening chips", "`selectionChips`",
// "`formatChipDistance`", "`applyChip`"; Q-0630 rows 5, 10, 14; 09k Chip display, Chip typed, Chip partition; S03 Live
// distance chips; 03g): the live distance chips of one selected wall or opening, and setting one by a typed value.
// Reads and returns only changed objects; never mutates its input.
import { formatLength, PLAN_DISPLAY_DENOMINATOR } from '../length';
import { openingOffsets, openingSpan, placeAtOffset } from '../openings/offsets';
import { isVerticalLine, leftEndIsLow, type OpeningObject } from '../openings/opening';
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN, coordsEqual } from '../tolerance';
import { wallFaceLines, wallLength, type WallObject } from '../walls/wall';
import { moveSelection } from './selection';

export type ChipSide = 'left' | 'right';

export type WallChip = {
  kind: 'wall';
  side: ChipSide;
  distance: number;
  neighborId: string;
  from: Point;
  to: Point;
};

export type OpeningChip = {
  kind: 'opening';
  side: ChipSide;
  distance: number;
  cornerWallId: string | null;
  from: Point;
  to: Point;
};

export type Chip = WallChip | OpeningChip;

export type ApplyChipResult =
  | { ok: true; changed: ModelObject[] }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'no_chip'
        | 'invalid_input'
        | 'past_corner'
        | 'overlap'
        | 'zero_length'
        | 'too_long'
        | 'join_lost';
      id: string;
    };

const tol = COMPARISON_TOLERANCE_IN;

const lower = (id: string) => id.toLowerCase();

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

const isOpening = (o: ModelObject): o is OpeningObject => o.type === 'opening';

const levelWallsOf = (objects: readonly ModelObject[], level: string) =>
  objects.filter((x): x is WallObject => isWall(x) && lower(x.data.level) === lower(level));

// Unit start->end direction, left normal and length of a wall; null when 1/64" or shorter.
function frame(w: WallObject): { d: Point; n: Point; L: number } | null {
  const { start, end } = w.data.geometry;
  const L = wallLength(w.data.geometry);
  if (L <= tol) return null;
  const d = { x: (end.x - start.x) / L, y: (end.y - start.y) / L };
  return { d, n: { x: -d.y, y: d.x }, L };
}

// The host of a hosted opening on its level, with the level's walls; null for a flagged opening or a stale host id.
function hostOf(
  objects: readonly ModelObject[],
  o: OpeningObject,
): { host: WallObject; walls: WallObject[] } | null {
  const hostId = o.data.geometry.hostWallId;
  if (hostId === null) return null;
  const walls = levelWallsOf(objects, o.data.level);
  const host = walls.find((w) => lower(w.id) === lower(hostId));
  return host === undefined ? null : { host, walls };
}

export function wallChips(objects: readonly ModelObject[], wallId: string): WallChip[] {
  const a = objects.find((x): x is WallObject => isWall(x) && lower(x.id) === lower(wallId));
  if (a === undefined) return [];
  const f = frame(a);
  if (f === null) return [];
  const { d, n, L } = f;
  const start = a.data.geometry.start;
  const across = (p: Point) => (p.x - start.x) * n.x + (p.y - start.y) * n.y;
  const along = (p: Point) => (p.x - start.x) * d.x + (p.y - start.y) * d.y;
  const faces = wallFaceLines(a.data);
  const aL = across(faces.left.start);
  const aR = across(faces.right.start);

  type Best = { distance: number; neighborId: string; mid: number; face: number };
  let left: Best | null = null;
  let right: Best | null = null;
  const better = (c: Best, b: Best | null) =>
    b === null ||
    (coordsEqual(c.distance, b.distance)
      ? lower(c.neighborId) < lower(b.neighborId)
      : c.distance < b.distance);

  for (const w of levelWallsOf(objects, a.data.level)) {
    if (lower(w.id) === lower(a.id) || frame(w) === null) continue;
    const { start: p, end: q } = w.data.geometry;
    if (Math.abs(across(p) - across(q)) > tol) continue;
    const minAlong = Math.min(along(p), along(q));
    const maxAlong = Math.max(along(p), along(q));
    const lo = Math.max(minAlong, 0);
    const hi = Math.min(maxAlong, L);
    if (hi - lo <= tol) continue;
    const mid = (lo + hi) / 2;
    const wf = wallFaceLines(w.data);
    const f1 = across(wf.left.start);
    const f2 = across(wf.right.start);
    const minFace = Math.min(f1, f2);
    const maxFace = Math.max(f1, f2);
    if (minFace >= aL - tol) {
      const c = { distance: Math.max(0, minFace - aL), neighborId: w.id, mid, face: minFace };
      if (better(c, left)) left = c;
    }
    if (maxFace <= aR + tol) {
      const c = { distance: Math.max(0, aR - maxFace), neighborId: w.id, mid, face: maxFace };
      if (better(c, right)) right = c;
    }
  }

  const at = (alongBy: number, acrossBy: number): Point => ({
    x: start.x + d.x * alongBy + n.x * acrossBy,
    y: start.y + d.y * alongBy + n.y * acrossBy,
  });
  const chips: WallChip[] = [];
  if (left !== null)
    chips.push({
      kind: 'wall',
      side: 'left',
      distance: left.distance,
      neighborId: left.neighborId,
      from: at(left.mid, aL),
      to: at(left.mid, left.face),
    });
  if (right !== null)
    chips.push({
      kind: 'wall',
      side: 'right',
      distance: right.distance,
      neighborId: right.neighborId,
      from: at(right.mid, aR),
      to: at(right.mid, right.face),
    });
  return chips;
}

export function openingChips(objects: readonly ModelObject[], openingId: string): OpeningChip[] {
  const o = objects.find(
    (x): x is OpeningObject => isOpening(x) && lower(x.id) === lower(openingId),
  );
  if (o === undefined) return [];
  const found = hostOf(objects, o);
  if (found === null) return [];
  const { host, walls } = found;
  const offsets = openingOffsets(o, host, walls);
  const span = openingSpan(o, host);
  const f = frame(host);
  if (offsets === null || span === null || f === null) return [];
  const { d } = f;
  const start = host.data.geometry.start;
  const lowIsLeft = leftEndIsLow(d, isVerticalLine(host.data.geometry));
  const leftEdge = lowIsLeft ? span.lo : span.hi;
  const rightEdge = lowIsLeft ? span.hi : span.lo;
  const at = (by: number): Point => ({ x: start.x + d.x * by, y: start.y + d.y * by });
  return [
    {
      kind: 'opening',
      side: 'left',
      distance: offsets.left,
      cornerWallId: offsets.leftCorner.wallId,
      from: at(leftEdge),
      to: at(offsets.leftCorner.at),
    },
    {
      kind: 'opening',
      side: 'right',
      distance: offsets.right,
      cornerWallId: offsets.rightCorner.wallId,
      from: at(rightEdge),
      to: at(offsets.rightCorner.at),
    },
  ];
}

export function selectionChips(objects: readonly ModelObject[], ids: readonly string[]): Chip[] {
  if (ids.length !== 1) return [];
  const id = ids[0]!;
  const o = objects.find((x) => lower(x.id) === lower(id));
  if (o === undefined) return [];
  if (isWall(o)) return wallChips(objects, id);
  if (isOpening(o)) return openingChips(objects, id);
  return [];
}

export function formatChipDistance(inches: number): string {
  return formatLength(Math.max(0, inches), PLAN_DISPLAY_DENOMINATOR);
}

export function applyChip(
  objects: readonly ModelObject[],
  id: string,
  side: ChipSide,
  value: number,
): ApplyChipResult {
  // (1) A wall or an opening.
  const o = objects.find((x) => (isWall(x) || isOpening(x)) && lower(x.id) === lower(id));
  if (o === undefined) return { ok: false, reason: 'not_found', id };
  // (2) The typed value; 0" is accepted.
  if (!Number.isFinite(value) || value < 0) return { ok: false, reason: 'invalid_input', id };
  // (3) A wall: the selection moves square to it.
  if (isWall(o)) {
    const chip = wallChips(objects, o.id).find((c) => c.side === side);
    const f = frame(o);
    if (chip === undefined || f === null) return { ok: false, reason: 'no_chip', id };
    const sign = side === 'left' ? 1 : -1;
    const by = chip.distance - value;
    const r = moveSelection(objects, [id], { x: sign * f.n.x * by, y: sign * f.n.y * by });
    if (r.ok) return r;
    return {
      ok: false,
      reason: r.reason === 'invalid_delta' ? 'invalid_input' : r.reason,
      id: r.id,
    };
  }
  // (4) An opening: it is placed at the typed offset on that side.
  if (!isOpening(o)) return { ok: false, reason: 'not_found', id };
  const found = hostOf(objects, o);
  if (openingChips(objects, o.id).length === 0 || found === null)
    return { ok: false, reason: 'no_chip', id };
  const r = placeAtOffset({
    host: found.host,
    walls: found.walls,
    openings: objects.filter(
      (x): x is OpeningObject => isOpening(x) && lower(x.data.level) === lower(o.data.level),
    ),
    width: o.data.attributes.width,
    near: o.data.geometry.center,
    side,
    offset: value,
    ignoreId: id,
  });
  if (!r.ok) return { ok: false, reason: r.reason, id };
  const c = r.center;
  return {
    ok: true,
    changed: [
      {
        ...o,
        data: { ...o.data, geometry: { ...o.data.geometry, center: { x: c.x, y: c.y } } },
      },
    ],
  };
}
