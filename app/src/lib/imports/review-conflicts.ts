// EZD-310 (S02 Controls "Typed or laser input: Type or laser a length; it overrides the scan", Conflict list ("Typed
// wins. This creates") "Lists every conflict the typed value creates (room no longer closes, opening offsets
// change). Red icon for errors, amber for warnings. Click a line to zoom to it"; Validation "Typed vs scan
// difference greater than the tolerance ... creates a conflict", "Room closure: typed lengths must add up; a gap is
// shown with its size", "Typed value change that moves an opening relative to a corner: warning with the change
// amount"; Round 24 #30 one tolerance for field measurements and scan-vs-typed; AC-EZD-310-1). Pure.
// - A typed value is kept in the item's fix (`typed`), so it is saved, undone and restored like any fix (EZD-309).
//   A typed wall keeps its start and its end moves along the wall to the typed length; a typed opening keeps its
//   centre and takes the typed width.
// - The room walk (vault/build/assumptions.md EZD-310): a closed room's boundary walls are walked in boundary order
//   from the room's first corner, which stays put. A typed length stretches its wall from its start; every later
//   wall in the walk moves with it, so the walk ends short of (or past) the first corner: that is the gap, at the
//   first corner. Openings on the typed wall change their offset from its far corner by the change; openings on
//   later walls of the walk move along their wall by the part of the change that runs along it.
import type { Pt, ReviewItem, ReviewOpening, ReviewRoom, ReviewWall } from './review';
import { ROOM_EDGE_REACH_IN } from './review';
import type { Decisions } from './review';
import type { Fixes, ItemFix, RoomFix, WallFix } from './review-fix';

// EZD-1998: the Not set tolerance lives in measurement-tolerance.ts, so the field measure screen can read it without
// loading the review code.
import { DEFAULT_MEASUREMENT_TOLERANCE_IN } from './measurement-tolerance';
export { DEFAULT_MEASUREMENT_TOLERANCE_IN };

/** The tolerance a review uses: the effective Defaults value of measurement_tolerance when it is a length, else 1/2". */
export function reviewTolerance(effective: unknown): number {
  return typeof effective === 'number' && Number.isFinite(effective) && effective >= 0
    ? effective
    : DEFAULT_MEASUREMENT_TOLERANCE_IN;
}

const len = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const unit = (a: Pt, b: Pt): Pt => {
  const l = len(a, b);
  return l === 0 ? { x: 1, y: 0 } : { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};

/** What the scan reads as a length: a wall's length, an opening's width; a room has none. */
export function scanLength(item: ReviewItem): number | null {
  if (item.type === 'wall') return len(item.geometry.start, item.geometry.end);
  if (item.type === 'opening') return item.width;
  return null;
}

/** The typed value kept in a fix, inches; null when the item was not typed. */
export function typedOf(fix: ItemFix | undefined): number | null {
  const t = (fix as { typed?: unknown } | undefined)?.typed;
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * The fix for a typed value on the item as it stands (its fix applied): a wall keeps its start and its end moves
 * along the wall to the typed length; an opening keeps its centre and takes the typed width. Rooms take no length.
 */
export function typedFix(item: ReviewItem, typed: number): ItemFix | null {
  if (item.type === 'wall') {
    const { start, end } = item.geometry;
    const u = unit(start, end);
    return {
      geometry: { start: { ...start }, end: { x: start.x + u.x * typed, y: start.y + u.y * typed } },
      typed,
    };
  }
  if (item.type === 'opening') return { center: { ...item.center }, width: typed, typed };
  return null;
}

/** Typed minus scan for the item, inches; null when it is not typed. */
function typedDelta(item: ReviewItem, fixes: Fixes): number | null {
  const typed = typedOf(fixes[item.id]);
  const scan = scanLength(item);
  return typed === null || scan === null ? null : typed - scan;
}

/** A typed value whose difference from the scan is greater than the tolerance (S02 Validation; at it is no conflict). */
export function isOverTolerance(item: ReviewItem, fixes: Fixes, tolerance: number): boolean {
  const d = typedDelta(item, fixes);
  return d !== null && Math.abs(d) > tolerance;
}

// ---- The room walk ----

export type Corner = 'northeast' | 'northwest' | 'southeast' | 'southwest';

type Boundary = { pts: Pt[]; cum: number[]; perimeter: number };

function boundaryOf(room: ReviewRoom): Boundary {
  const pts = room.boundary;
  const cum: number[] = [0];
  for (let i = 0; i < pts.length; i += 1) cum.push(cum[i] + len(pts[i], pts[(i + 1) % pts.length]));
  return { pts, cum, perimeter: cum[pts.length] };
}

/** Distance of p from the boundary and its arc-length position from the first corner. */
function onBoundary(b: Boundary, p: Pt): { dist: number; s: number } {
  let best = { dist: Infinity, s: 0 };
  for (let i = 0; i < b.pts.length; i += 1) {
    const a = b.pts[i];
    const c = b.pts[(i + 1) % b.pts.length];
    const l2 = (c.x - a.x) ** 2 + (c.y - a.y) ** 2;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (c.x - a.x) + (p.y - a.y) * (c.y - a.y)) / l2));
    const dist = Math.hypot(p.x - (a.x + t * (c.x - a.x)), p.y - (a.y + t * (c.y - a.y)));
    if (dist < best.dist) best = { dist, s: b.cum[i] + t * Math.sqrt(l2) };
  }
  return best;
}

type WalkWall = { wall: ReviewWall; dir: Pt };

/**
 * The room's boundary walls in walk order, each with its direction along the walk. A wall belongs to the walk when
 * both ends and its middle sit on the boundary (half its thickness, at least 6 in), so a partition across the room
 * is not part of it.
 */
function roomWalk(room: ReviewRoom, walls: readonly ReviewWall[]): WalkWall[] {
  if (!room.closed || room.boundary.length < 3) return [];
  const b = boundaryOf(room);
  if (b.perimeter === 0) return [];
  const out: { w: WalkWall; s: number }[] = [];
  for (const wall of walls) {
    const r = Math.max(ROOM_EDGE_REACH_IN, (wall.thickness ?? 0) / 2);
    const { start, end } = wall.geometry;
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const ps = onBoundary(b, start);
    const pe = onBoundary(b, end);
    const pm = onBoundary(b, mid);
    if (ps.dist > r || pe.dist > r || pm.dist > r) continue;
    // Forward when the walk meets the wall's start first: going start -> middle runs with the boundary.
    let ds = pm.s - ps.s;
    if (ds > b.perimeter / 2) ds -= b.perimeter;
    if (ds < -b.perimeter / 2) ds += b.perimeter;
    const u = unit(start, end);
    out.push({ w: { wall, dir: ds >= 0 ? u : { x: -u.x, y: -u.y } }, s: pm.s });
  }
  return out.sort((a, c) => a.s - c.s).map((o) => o.w);
}

/** The compass corner of a point of the room, against the middle of its corners (+y is north, +x east). */
export function cornerOf(room: ReviewRoom, p: Pt): Corner {
  const n = room.boundary.length;
  const cx = room.boundary.reduce((s, q) => s + q.x, 0) / n;
  const cy = room.boundary.reduce((s, q) => s + q.y, 0) / n;
  return `${p.y >= cy ? 'north' : 'south'}${p.x >= cx ? 'east' : 'west'}` as Corner;
}

export type RoomGap = { roomId: string; inches: number; point: Pt; corner: Corner };

/**
 * EZD-311: where the room's walk ends against its first corner, as a vector (in): the sum of each typed wall's
 * change along its walk direction. Zero when nothing on the walk is typed.
 */
export function gapVector(room: ReviewRoom, detected: readonly ReviewItem[], fixes: Fixes): Pt {
  const walls = detected.filter((i): i is ReviewWall => i.type === 'wall');
  let x = 0;
  let y = 0;
  for (const { wall, dir } of roomWalk(room, walls)) {
    const d = typedDelta(wall, fixes) ?? 0;
    x += d * dir.x;
    y += d * dir.y;
  }
  return { x, y };
}

/**
 * A closed room whose typed lengths no longer add up (S02 Validation "Room closure"): the walk's miss at the first
 * corner, when it is greater than the tolerance. Null when the room closes.
 */
export function roomGap(
  room: ReviewRoom,
  detected: readonly ReviewItem[],
  fixes: Fixes,
  tolerance: number,
): RoomGap | null {
  const { x: gx, y: gy } = gapVector(room, detected, fixes);
  const inches = Math.hypot(gx, gy);
  if (!(inches > tolerance)) return null;
  const point = room.boundary[0];
  return { roomId: room.id, inches, point: { ...point }, corner: cornerOf(room, point) };
}

/** Every room that no longer closes, in room number order (the red gap markers on the canvas). */
export function roomGaps(detected: readonly ReviewItem[], fixes: Fixes, tolerance: number): RoomGap[] {
  return detected
    .filter((i): i is ReviewRoom => i.type === 'room')
    .sort((a, b) => a.number - b.number)
    .map((r) => roomGap(r, detected, fixes, tolerance))
    .filter((g): g is RoomGap => g !== null);
}

// ---- The conflict list ----

export type Conflict =
  | { kind: 'gap'; severity: 'error'; id: string; inches: number; point: Pt; corner: Corner }
  | { kind: 'opening_offset'; severity: 'warning'; id: string; inches: number; point: Pt };

/** An amount that shows as 0" at 1/16" is no change. */
const MIN_SHOWN_IN = 1 / 32;

/**
 * Every conflict the item's typed value creates (S02 Conflict list; AC-EZD-310-1), or none when it is not typed or
 * is within the tolerance. Errors first (each room the typed wall leaves open, by room number), then warnings (each
 * opening whose offset from a corner changes, in detection order). `detected` are the scanned items; `fixes` hold
 * the typed values; points are where the canvas zooms to (the gap's corner, the opening's centre as it stands).
 */
export function itemConflicts(
  detected: readonly ReviewItem[],
  fixes: Fixes,
  id: string,
  tolerance: number,
): Conflict[] {
  const item = detected.find((i) => i.id === id);
  if (!item || !isOverTolerance(item, fixes, tolerance)) return [];
  const delta = typedDelta(item, fixes) ?? 0;
  const centreOf = (o: ReviewOpening): Pt => {
    const f = fixes[o.id] as { center?: Pt } | undefined;
    return { ...(f?.center ?? o.center) };
  };

  if (item.type === 'opening') {
    // A typed width keeps the centre, so each edge moves by half the change.
    return [
      { kind: 'opening_offset', severity: 'warning', id: item.id, inches: Math.abs(delta) / 2, point: centreOf(item) },
    ];
  }
  if (item.type !== 'wall') return [];

  const walls = detected.filter((i): i is ReviewWall => i.type === 'wall');
  const openings = detected.filter((i): i is ReviewOpening => i.type === 'opening');
  const rooms = detected
    .filter((i): i is ReviewRoom => i.type === 'room')
    .sort((a, b) => a.number - b.number);

  const errors: Conflict[] = [];
  const moved = new Map<string, number>();
  for (const o of openings) if (o.hostWallId === item.id) moved.set(o.id, Math.abs(delta));
  for (const room of rooms) {
    const walk = roomWalk(room, walls);
    const at = walk.findIndex((w) => w.wall.id === item.id);
    if (at < 0) continue;
    const gap = roomGap(room, detected, fixes, tolerance);
    if (gap && !isGapKept(room, detected, fixes)) {
      errors.push({
        kind: 'gap',
        severity: 'error',
        id: room.id,
        inches: gap.inches,
        point: gap.point,
        corner: gap.corner,
      });
    }
    const shift = { x: delta * walk[at].dir.x, y: delta * walk[at].dir.y };
    for (const later of walk.slice(at + 1)) {
      const u = unit(later.wall.geometry.start, later.wall.geometry.end);
      const along = Math.abs(shift.x * u.x + shift.y * u.y);
      for (const o of openings) {
        if (o.hostWallId !== later.wall.id) continue;
        moved.set(o.id, Math.max(moved.get(o.id) ?? 0, along));
      }
    }
  }
  const warnings: Conflict[] = openings
    .filter((o) => (moved.get(o.id) ?? 0) >= MIN_SHOWN_IN)
    .map((o) => ({
      kind: 'opening_offset' as const,
      severity: 'warning' as const,
      id: o.id,
      inches: moved.get(o.id) ?? 0,
      point: centreOf(o),
    }));
  return [...errors, ...warnings];
}

// ---- Resolve the gap (EZD-311) ----
// S02 Controls "Pick the wall that absorbs it: Enters pick mode; click a wall on the canvas; that wall's length
// changes so the room closes. Only shown when a room no longer closes", "Keep the room out of square: Accepts the
// gap; room is kept out of square; warning overridden"; Validation "Finish import blocked while any To check item is
// unresolved or any room has an unresolved gap"; Decisions "Finish import requires every item to be resolved
// (accepted, fixed or deleted) and every room gap resolved", "Pick the wall that absorbs it accepts any wall of the
// room that does not close, adjacent to the gap or not. Walls of other rooms cannot be picked"; AC-EZD-311-1.
// - Absorb: the picked wall takes a typed length (kept in its fix like any typed value) that cancels the gap along
//   it, so the walk closes. A wall across the gap cannot absorb it; a gap with parts both ways has no single wall
//   that absorbs it (Keep only, as in the Plan editor, EZD-210a).
// - Keep: the room's fix keeps the gap vector it accepted. The gap stays resolved only while the walk still ends on
//   that vector (within 1/32"); a later typed value that changes the gap opens it again (as closureOverride.gap in
//   the Plan editor). The room's decision is left as it is.

/** Two gaps match within this (in): a kept gap still applies, a wall still runs along the gap. */
export const GAP_MATCH_IN = 1 / 32;

/** The longest length a wall can take (200' 0", as the Plan editor's typed lengths). */
export const MAX_WALL_IN = 2400;

/** The gap vector a room's fix keeps (Keep the room out of square), or null. */
export function keptGap(fix: ItemFix | undefined): Pt | null {
  const k = (fix as RoomFix | undefined)?.keep?.gap;
  return k && Number.isFinite(k.x) && Number.isFinite(k.y) ? { x: k.x, y: k.y } : null;
}

/** The room was kept out of square on the gap it has now. */
export function isGapKept(room: ReviewRoom, detected: readonly ReviewItem[], fixes: Fixes): boolean {
  const k = keptGap(fixes[room.id]);
  if (!k) return false;
  const g = gapVector(room, detected, fixes);
  return Math.hypot(g.x - k.x, g.y - k.y) <= GAP_MATCH_IN;
}

export type OpenGap = RoomGap & {
  /** The walk's miss at the first corner (in). */
  vector: Pt;
  /** The room's boundary walls, in walk order (the walls that show Resolve the gap when selected, Q-0630). */
  wallIds: string[];
  /** Some wall of the room runs along the gap, so Pick the wall that absorbs it is offered. */
  absorbable: boolean;
};

/** The part of v across direction u (u a unit vector). */
const across = (v: Pt, u: Pt) => Math.abs(v.x * u.y - v.y * u.x);

/**
 * Every room gap still to resolve, in room number order: rooms that no longer close, not kept out of square on the
 * gap they have now, and not deleted (a deleted room does not become model data).
 */
export function openGaps(
  detected: readonly ReviewItem[],
  decisions: Decisions,
  fixes: Fixes,
  tolerance: number,
): OpenGap[] {
  const walls = detected.filter((i): i is ReviewWall => i.type === 'wall');
  const out: OpenGap[] = [];
  for (const gap of roomGaps(detected, fixes, tolerance)) {
    const room = detected.find((i): i is ReviewRoom => i.type === 'room' && i.id === gap.roomId);
    if (!room || decisions[room.id] === 'rejected' || isGapKept(room, detected, fixes)) continue;
    const vector = gapVector(room, detected, fixes);
    const walk = roomWalk(room, walls);
    out.push({
      ...gap,
      vector,
      wallIds: walk.map((w) => w.wall.id),
      absorbable: walk.some((w) => across(vector, w.dir) <= tolerance),
    });
  }
  return out;
}

/** The open gap the inspector shows for the selected item: the selected room's, or that of a room the wall bounds. */
export function gapForSelection(gaps: readonly OpenGap[], selectedId: string | null): OpenGap | null {
  if (selectedId === null) return null;
  return gaps.find((g) => g.roomId === selectedId) ?? gaps.find((g) => g.wallIds.includes(selectedId)) ?? null;
}

export type AbsorbRefusal = 'no_gap' | 'not_in_room' | 'across' | 'zero_length' | 'too_long';
export type AbsorbOutcome = { ok: true; fix: WallFix } | { ok: false; reason: AbsorbRefusal };

/**
 * Pick the wall that absorbs it: the fix that gives `wallId` the length closing the room's gap. The wall must be one
 * of the room's boundary walls (any of them, adjacent to the gap or not) and run along the gap (what is left across
 * it is within the tolerance). Its length now (typed, else scanned) changes by the gap's part along its walk
 * direction; it must stay longer than 0" and at most 200' 0".
 */
export function absorbGap(
  detected: readonly ReviewItem[],
  decisions: Decisions,
  fixes: Fixes,
  tolerance: number,
  roomId: string,
  wallId: string,
): AbsorbOutcome {
  const gap = openGaps(detected, decisions, fixes, tolerance).find((g) => g.roomId === roomId);
  const room = detected.find((i): i is ReviewRoom => i.type === 'room' && i.id === roomId);
  if (!gap || !room) return { ok: false, reason: 'no_gap' };
  const walls = detected.filter((i): i is ReviewWall => i.type === 'wall');
  const step = roomWalk(room, walls).find((w) => w.wall.id === wallId);
  if (!step) return { ok: false, reason: 'not_in_room' };
  if (across(gap.vector, step.dir) > tolerance) return { ok: false, reason: 'across' };
  const along = gap.vector.x * step.dir.x + gap.vector.y * step.dir.y;
  const now = typedOf(fixes[wallId]) ?? len(step.wall.geometry.start, step.wall.geometry.end);
  const length = now - along;
  if (length < GAP_MATCH_IN) return { ok: false, reason: 'zero_length' };
  if (length > MAX_WALL_IN) return { ok: false, reason: 'too_long' };
  const f = fixes[wallId] as WallFix | undefined;
  const standing: ReviewWall = f?.geometry ? { ...step.wall, geometry: f.geometry } : step.wall;
  return { ok: true, fix: typedFix(standing, length) as WallFix };
}

/**
 * Keep the room out of square: the room's fix keeping the gap it has now (its corners as they stand), or null when
 * the room has no open gap.
 */
export function keepFix(
  detected: readonly ReviewItem[],
  decisions: Decisions,
  fixes: Fixes,
  tolerance: number,
  roomId: string,
): RoomFix | null {
  const gap = openGaps(detected, decisions, fixes, tolerance).find((g) => g.roomId === roomId);
  const room = detected.find((i): i is ReviewRoom => i.type === 'room' && i.id === roomId);
  if (!gap || !room) return null;
  const f = fixes[roomId] as RoomFix | undefined;
  const boundary = (f?.boundary ?? room.boundary).map((p) => ({ x: p.x, y: p.y }));
  return { boundary, keep: { gap: { x: gap.vector.x, y: gap.vector.y } } };
}

/**
 * Finish import is blocked (S02 Validation; Decisions; AC-EZD-311-1) while any item has no decision (accepted,
 * fixed or deleted) or any room has a gap still to resolve.
 */
export function finishBlocked(
  detected: readonly ReviewItem[],
  decisions: Decisions,
  fixes: Fixes,
  tolerance: number,
): boolean {
  if (detected.some((i) => decisions[i.id] === undefined)) return true;
  return openGaps(detected, decisions, fixes, tolerance).length > 0;
}
