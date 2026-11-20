// EZD-505 (S05 Controls "Beam", "Spacing input", "Count input", "Length input", "Direction select", "Placement
// select", "Match select", "Canvas drag on object"; S05 Validation "Level beams in a vault must sit below the ridge and
// at or above the wall plate; warn otherwise"; AC-EZD-505-1): the beams of a beam set, worked out from its room, and
// the set's warnings. Pure; model inches, y up.
//
// The set's frame: the room's ridge line gives the ridge direction; a room with no ridge takes its longest boundary
// edge. Across ridge: each beam runs square to the ridge and the beams are spaced along it. With ridge: each beam
// runs along the ridge and the beams are spaced across it. The span is the room's extent along the spacing axis.
// By spacing: as many beams as whole spacings fit in the span; by count: the span split in equal shares. Either way
// the set is centred on the span, so the end gaps are half a spacing or more (vault/build/assumptions.md EZD-505).
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { wallFaceLines } from '../walls/wall';
import type {
  BeamData,
  BeamPlacement,
  CeilingType,
  ModelObject,
  Point,
  RoomData,
  WallData,
} from '../schema';
import type { PickShape } from '../selection/shapes';

const tol = COMPARISON_TOLERANCE_IN;

type Room = { id: string; data: RoomData };
type Wall = { id: string; data: WallData };

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

/** The set moved by `delta` (S05 "Beams in a set move as a set"). */
export function moveBeamSet(beam: BeamData, delta: Point): BeamData {
  return { ...beam, geometry: { ...beam.geometry, shift: add(beam.geometry.shift, delta) } };
}

/** The walls of the room's level whose face lies along one of the room's boundary edges. */
function roomWalls(room: Room, walls: readonly Wall[]): Wall[] {
  const b = room.data.geometry.boundary;
  const level = room.data.level.toLowerCase();
  return walls.filter((w) => {
    if (w.data.level.toLowerCase() !== level) return false;
    const faces = wallFaceLines(w.data);
    return [faces.left, faces.right].some((f) => {
      const u = unit(f.start, f.end);
      if (u === null) return false;
      const L = dot({ x: f.end.x - f.start.x, y: f.end.y - f.start.y }, u);
      const off = (p: Point) =>
        Math.abs((p.x - f.start.x) * u.y - (p.y - f.start.y) * u.x);
      const t = (p: Point) => (p.x - f.start.x) * u.x + (p.y - f.start.y) * u.y;
      for (let i = 0; i < b.length; i++) {
        const p = b[i]!;
        const q = b[(i + 1) % b.length]!;
        if (off(p) > tol || off(q) > tol) continue;
        const lo = Math.max(0, Math.min(t(p), t(q)));
        const hi = Math.min(L, Math.max(t(p), t(q)));
        if (hi - lo > tol) return true;
      }
      return false;
    });
  });
}

/**
 * The room's wall plate height: its stored wall heights when its ceiling is set per wall, else the lowest height of
 * the walls around it; null when neither is known.
 */
export function roomPlateHeight(room: Room, walls: readonly Wall[]): number | null {
  const c = room.data.attributes.ceiling;
  if (c !== null && c.heightsBy === 'wall' && c.wallHeights.length > 0)
    return Math.min(...c.wallHeights.map((w) => w.height));
  const around = roomWalls(room, walls);
  if (around.length === 0) return null;
  return Math.min(...around.map((w) => w.data.attributes.height));
}

/** The room's ridge height, or null when its ceiling has no ridge. */
export function roomRidgeHeight(room: RoomData): number | null {
  return room.attributes.ceiling?.ridge?.height ?? null;
}

/** The largest gap between two rooms' facing edges that still makes them adjoining: one thick wall. */
export const ADJOINING_GAP_IN = 12;

/**
 * The room next to this one (same level, a boundary edge facing one of its edges across at most one wall's
 * thickness, the longest shared run first); null when there is none.
 */
export function adjoiningRoom(room: Room, rooms: readonly Room[]): Room | null {
  const b = room.data.geometry.boundary;
  const level = room.data.level.toLowerCase();
  let best: Room | null = null;
  let bestRun = tol;
  for (const other of rooms) {
    if (other.id.toLowerCase() === room.id.toLowerCase()) continue;
    if (other.data.level.toLowerCase() !== level) continue;
    const ob = other.data.geometry.boundary;
    let run = 0;
    for (let i = 0; i < b.length; i++) {
      const p = b[i]!;
      const q = b[(i + 1) % b.length]!;
      const u = unit(p, q);
      if (u === null) continue;
      const n = perp(u);
      const L = dot({ x: q.x - p.x, y: q.y - p.y }, u);
      for (let j = 0; j < ob.length; j++) {
        const r = ob[j]!;
        const s = ob[(j + 1) % ob.length]!;
        const v = unit(r, s);
        if (v === null || Math.abs(Math.abs(dot(u, v)) - 1) > 1e-6) continue;
        const gap = Math.abs(dot({ x: r.x - p.x, y: r.y - p.y }, n));
        if (gap > ADJOINING_GAP_IN + tol) continue;
        const tr = dot({ x: r.x - p.x, y: r.y - p.y }, u);
        const ts = dot({ x: s.x - p.x, y: s.y - p.y }, u);
        const lo = Math.max(0, Math.min(tr, ts));
        const hi = Math.min(L, Math.max(tr, ts));
        if (hi > lo) run += hi - lo;
      }
    }
    if (
      run > bestRun + tol ||
      (best !== null && Math.abs(run - bestRun) <= tol && other.id.toLowerCase() < best.id.toLowerCase())
    ) {
      best = other;
      bestRun = run;
    }
  }
  return best;
}

/** S05 Match "Adjoining room sets Height AFF to the finished ceiling height of the adjoining room". */
export function finishedCeilingHeight(room: Room, walls: readonly Wall[]): number | null {
  return roomPlateHeight(room, walls);
}

export type BeamWarning = 'above_ridge' | 'below_plate';

/**
 * S05 Validation: a level beam set in a vault must sit below the ridge (its top, Height AFF plus the beam height, at
 * or under the ridge height) and at or above the wall plate (its bottom, Height AFF, at or over the plate height).
 * A height that is not known skips its check; other placements have none.
 */
export function beamWarnings(
  beam: BeamData,
  heights: { ridge: number | null; plate: number | null },
): BeamWarning[] {
  if (beam.attributes.placement !== 'level_in_vault') return [];
  const out: BeamWarning[] = [];
  const bottom = beam.attributes.heightAff;
  const top = bottom + beam.attributes.height;
  if (heights.ridge !== null && top > heights.ridge + tol) out.push('above_ridge');
  if (heights.plate !== null && bottom < heights.plate - tol) out.push('below_plate');
  return out;
}

/** The warnings of one beam set among the model's objects. */
export function beamSetWarnings(beam: BeamData, objects: readonly ModelObject[]): BeamWarning[] {
  const roomId = beam.geometry.roomId.toLowerCase();
  const room = objects.find(
    (o): o is Extract<ModelObject, { type: 'room' }> =>
      o.type === 'room' && o.id.toLowerCase() === roomId,
  );
  if (room === undefined) return [];
  const walls = objects.filter((o): o is Extract<ModelObject, { type: 'wall' }> => o.type === 'wall');
  return beamWarnings(beam, {
    ridge: roomRidgeHeight(room.data),
    plate: roomPlateHeight(room, walls),
  });
}

/** S05 "Beams follow the slope or sit level per Placement": the placement a new set takes from its room's ceiling. */
export function defaultBeamPlacement(ceilingType: CeilingType): BeamPlacement {
  if (ceilingType === 'vaulted') return 'level_in_vault';
  if (ceilingType === 'single_slope') return 'follow_slope';
  return 'on_flat';
}

/** The default beam size and spacing (board S05Ceiling "6" x 8"", "4' 0" o.c."; vault/build/assumptions.md EZD-505). */
export const DEFAULT_BEAM_WIDTH_IN = 6;
export const DEFAULT_BEAM_HEIGHT_IN = 8;
export const DEFAULT_BEAM_SPACING_IN = 48;

/** A new beam set on the room's ceiling: Height AFF matches the adjoining room when there is one. */
export function newBeamSet(
  room: Room,
  objects: readonly ModelObject[],
  status: BeamData['status'],
): BeamData {
  const rooms = objects.filter((o): o is Extract<ModelObject, { type: 'room' }> => o.type === 'room');
  const walls = objects.filter((o): o is Extract<ModelObject, { type: 'wall' }> => o.type === 'wall');
  const ceilingType = room.data.attributes.ceilingType ?? 'flat';
  const plate = roomPlateHeight(room, walls);
  const next = adjoiningRoom(room, rooms);
  const adjoining = next === null ? null : finishedCeilingHeight(next, walls);
  const heightAff = adjoining ?? plate ?? DEFAULT_PLATE_FALLBACK_IN;
  return {
    geometry: { roomId: room.id, shift: { x: 0, y: 0 } },
    status,
    level: room.data.level,
    attributes: {
      placement: defaultBeamPlacement(ceilingType),
      heightAff,
      match: adjoining !== null && next !== null ? 'adjoining' : 'custom',
      matchRoomId: adjoining !== null && next !== null ? next.id : null,
      width: DEFAULT_BEAM_WIDTH_IN,
      height: DEFAULT_BEAM_HEIGHT_IN,
      layout: { by: 'spacing', spacing: DEFAULT_BEAM_SPACING_IN },
      length: null,
      direction: 'across_ridge',
      endDetail: 'square',
    },
  };
}

/** Height AFF when neither an adjoining room nor the plate is known: a standard 8' 0" wall. */
const DEFAULT_PLATE_FALLBACK_IN = 96;
