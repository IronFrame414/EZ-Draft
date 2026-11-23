// EZD-1001b (phase-10.md EZD-1001b "Meshes for flat, sloped, vaulted, tray and coffered ceilings, soffits and beams;
// walls cut under slopes"; S07 Data shown "ceiling slope, beams"; AC-EZD-1001b-1, -2): the ceiling parts of the 3D
// scene, worked out from the model. Pure; model inches, z up from the floor. The lazy 3D scene triangulates the
// outlines (three's ShapeUtils) and hands the triangles here to be lifted onto the ceiling.
//
// The ceiling surface is the one the walls are cut to (ceiling/wall-top.ts slopedCeiling) and the section preview
// draws (ceiling/section.ts): flat at the plate height, or for a single slope or vault with a ridge above the plate,
// the plate height P at the low edges rising straight to the ridge height R along the ridge line. A vault bends at
// the ridge line, so every triangle crossing it is split there before it is lifted: the ridge itself is in the mesh.
// Soffits hang down from the ceiling (their bottom level at the plate height less the drop, as the EZD-513 tag reads
// it); trays and coffers rise above it (their top at the ceiling plus the depth) and leave a hole in the room's
// ceiling. Beams follow ceiling/section.ts: level beams sit at Height AFF and stop where their top meets the slope;
// the other placements hang under the ceiling (vault/build/assumptions.md EZD-1001b).
import type { BeamData, ModelObject, Point, RoomData, WallData } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { DEFAULT_WALL_HEIGHT_IN } from '../walls/wall';
import { beamLayout, ridgeDirection, roomPlateHeight } from '../ceiling/beams';
import { pointInRing } from '../rooms/area';

const tol = COMPARISON_TOLERANCE_IN;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
type Room = { id: string; data: RoomData };
type Wall = { id: string; data: WallData };
export type Vec3 = readonly [number, number, number];
export type Triangle2 = readonly [Point, Point, Point];

/**
 * A room's ceiling surface. Flat: one height. Sloped: `low` (P) at the low edges and `ridge` (R) along the ridge line
 * `dot(p, normal) = at`; the run on each side is from the ridge line to the room's farthest point that side
 * (`lo` <= 0 <= `hi`, measured along `normal` from the ridge line).
 */
export type CeilingSurface =
  | { kind: 'flat'; low: number }
  | {
      kind: 'sloped';
      low: number;
      ridge: number;
      normal: Point;
      at: number;
      lo: number;
      hi: number;
    };

/** The room's ceiling surface, as wallTopProfile cuts the walls under it. */
export function ceilingSurface(room: Room, walls: readonly Wall[]): CeilingSurface {
  const a = room.data.attributes;
  const type = a.ceilingType ?? 'flat';
  const ridge = a.ceiling?.ridge ?? null;
  // By point the low height is the lowest stored point (as slopedCeiling and the EZD-503 summary read it).
  const points = a.ceiling?.heightsBy === 'point' ? a.ceiling.pointHeights : [];
  const P =
    (type === 'vaulted' || type === 'single_slope') && ridge !== null && points.length > 0
      ? Math.min(...points.map((q) => q.height))
      : (roomPlateHeight(room, walls) ?? DEFAULT_WALL_HEIGHT_IN);
  if ((type !== 'vaulted' && type !== 'single_slope') || ridge === null || ridge.height <= P + tol)
    return { kind: 'flat', low: P };
  const u = ridgeDirection(room.data);
  const normal: Point = { x: -u.y, y: u.x };
  const at = dot(ridge.start, normal);
  let lo = 0;
  let hi = 0;
  for (const p of room.data.geometry.boundary) {
    lo = Math.min(lo, dot(p, normal) - at);
    hi = Math.max(hi, dot(p, normal) - at);
  }
  return { kind: 'sloped', low: P, ridge: ridge.height, normal, at, lo, hi };
}

/** The ceiling height over a plan point. */
export function ceilingHeightAt(s: CeilingSurface, p: Point): number {
  if (s.kind === 'flat') return s.low;
  const d = dot(p, s.normal) - s.at;
  const run = d >= 0 ? s.hi : -s.lo;
  if (run <= tol) return s.ridge;
  const h = s.ridge - ((s.ridge - s.low) * Math.abs(d)) / run;
  return Math.min(s.ridge, Math.max(s.low, h));
}

/** The highest point of the ceiling: the ridge on a sloped one. */
export function ceilingTop(s: CeilingSurface): number {
  return s.kind === 'flat' ? s.low : s.ridge;
}

/** How a part's height is set: on the ceiling plus an offset, or at a fixed height. */
export type HeightRule = { kind: 'surface'; offset: number } | { kind: 'level'; z: number };

function heightOf(s: CeilingSurface, rule: HeightRule, p: Point): number {
  return rule.kind === 'level' ? rule.z : ceilingHeightAt(s, p) + rule.offset;
}

/** Signed distance from the bend (ridge) line; null for a surface with no bend. */
function bendDistance(s: CeilingSurface): ((p: Point) => number) | null {
  return s.kind === 'flat' ? null : (p) => dot(p, s.normal) - s.at;
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** A triangle cut by the line d = 0 into pieces each wholly on one side. */
function splitTriangle(t: Triangle2, d: (p: Point) => number): Triangle2[] {
  const ds = t.map(d);
  const sign = (x: number) => (x > tol ? 1 : x < -tol ? -1 : 0);
  if (!ds.some((x) => sign(x) > 0) || !ds.some((x) => sign(x) < 0)) return [t];
  // The vertex alone on its side: the other two are across the line or on it (not both on it).
  const lone = ds.findIndex(
    (x, i) => sign(x) !== 0 && ds.every((y, j) => j === i || sign(y) !== sign(x)),
  );
  const a = t[lone]!;
  const b = t[(lone + 1) % 3]!;
  const c = t[(lone + 2) % 3]!;
  const da = ds[lone]!;
  const db = ds[(lone + 1) % 3]!;
  const dc = ds[(lone + 2) % 3]!;
  if (sign(db) === 0) {
    const ac = lerp(a, c, da / (da - dc));
    return [
      [a, b, ac],
      [b, c, ac],
    ];
  }
  if (sign(dc) === 0) {
    const ab = lerp(a, b, da / (da - db));
    return [
      [a, ab, c],
      [ab, b, c],
    ];
  }
  const ab = lerp(a, b, da / (da - db));
  const ac = lerp(a, c, da / (da - dc));
  return [
    [a, ab, ac],
    [ab, b, c],
    [ab, c, ac],
  ];
}

/**
 * Plan triangles lifted onto the ceiling by `rule`, as flat x, y, z triangle positions. Triangles crossing the ridge
 * line are split there first, so each piece lies on one plane of the surface.
 */
export function liftTriangles(
  s: CeilingSurface,
  triangles: readonly Triangle2[],
  rule: HeightRule,
): number[] {
  const d = rule.kind === 'surface' ? bendDistance(s) : null;
  const out: number[] = [];
  for (const t of triangles) {
    for (const piece of d === null ? [t] : splitTriangle(t, d)) {
      for (const p of piece) out.push(p.x, p.y, heightOf(s, rule, p));
    }
  }
  return out;
}

/** An outline's edges split where they cross the ridge line, as a closed loop of points. */
function splitRing(s: CeilingSurface, ring: readonly Point[]): Point[] {
  const d = bendDistance(s);
  if (d === null) return [...ring];
  const out: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    out.push(p);
    const dp = d(p);
    const dq = d(q);
    if ((dp > tol && dq < -tol) || (dp < -tol && dq > tol)) out.push(lerp(p, q, dp / (dp - dq)));
  }
  return out;
}

/** The upright sides of an outline from `bottom` to `top`, as flat x, y, z triangle positions. */
export function ringSides(
  s: CeilingSurface,
  ring: readonly Point[],
  bottom: HeightRule,
  top: HeightRule,
): number[] {
  const loop = splitRing(s, ring);
  const out: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i]!;
    const q = loop[(i + 1) % loop.length]!;
    const pb = heightOf(s, bottom, p);
    const qb = heightOf(s, bottom, q);
    const pt = heightOf(s, top, p);
    const qt = heightOf(s, top, q);
    out.push(p.x, p.y, pb, q.x, q.y, qb, q.x, q.y, qt);
    out.push(p.x, p.y, pb, q.x, q.y, qt, p.x, p.y, pt);
  }
  return out;
}

// ---------------------------------------------------------------- the parts of the model

const lower = (id: string) => id.toLowerCase();
type Of<T extends ModelObject['type']> = Extract<ModelObject, { type: T }>;

/** One room's ceiling: its outline, the tray and coffer holes in it, and its surface. */
export type RoomCeiling3d = { boundary: Point[]; holes: Point[][]; surface: CeilingSurface };

/**
 * A soffit, tray or coffer as an upright prism over its outline: `bottom` and `top` give its heights; `capTop` and
 * `capBottom` say which ends are closed (a tray or coffer is open below, into the room).
 */
export type CeilingPrism3d = {
  ring: Point[];
  surface: CeilingSurface;
  bottom: HeightRule;
  top: HeightRule;
  capTop: boolean;
  capBottom: boolean;
};

/** A beam piece: eight corners, the bottom four then the top four, each four in the same order round the beam. */
export type BeamBox = Vec3[];

/** The room's ceiling outline, holes and surface; the holes are its trays and coffers (crown is trim, no hole). */
export function roomCeiling3d(room: Room, objects: readonly ModelObject[]): RoomCeiling3d {
  const walls = objects.filter((o): o is Of<'wall'> => o.type === 'wall');
  const id = lower(room.id);
  const holes = objects
    .filter(
      (o): o is Of<'ceiling_shape'> =>
        o.type === 'ceiling_shape' &&
        o.data.attributes.kind !== 'crown' &&
        lower(o.data.geometry.roomId) === id,
    )
    .map((o) => o.data.geometry.boundary.map((p) => ({ x: p.x, y: p.y })));
  return {
    boundary: room.data.geometry.boundary.map((p) => ({ x: p.x, y: p.y })),
    holes,
    surface: ceilingSurface(room, walls),
  };
}

/** A tray or coffer: open below, rising `depth` above its room's ceiling. Null for crown or a missing room. */
export function ceilingShape3d(
  shape: Of<'ceiling_shape'>,
  objects: readonly ModelObject[],
): CeilingPrism3d | null {
  if (shape.data.attributes.kind === 'crown') return null;
  const roomId = lower(shape.data.geometry.roomId);
  const room = objects.find((o): o is Of<'room'> => o.type === 'room' && lower(o.id) === roomId);
  if (room === undefined) return null;
  const walls = objects.filter((o): o is Of<'wall'> => o.type === 'wall');
  return {
    ring: shape.data.geometry.boundary.map((p) => ({ x: p.x, y: p.y })),
    surface: ceilingSurface(room, walls),
    bottom: { kind: 'surface', offset: 0 },
    top: { kind: 'surface', offset: shape.data.attributes.depth },
    capTop: true,
    capBottom: false,
  };
}

/** The room on the soffit's level holding the middle of its outline; null when it is in no room. */
function soffitRoom(soffit: Of<'soffit'>, objects: readonly ModelObject[]): Of<'room'> | null {
  const b = soffit.data.geometry.boundary;
  const mid = {
    x: b.reduce((n, p) => n + p.x, 0) / b.length,
    y: b.reduce((n, p) => n + p.y, 0) / b.length,
  };
  const level = lower(soffit.data.level);
  for (const o of objects)
    if (
      o.type === 'room' &&
      lower(o.data.level) === level &&
      pointInRing(mid, o.data.geometry.boundary)
    )
      return o;
  return null;
}

/** A soffit: from the ceiling down to a level bottom at the room's plate height less the drop. Null outside a room. */
export function soffit3d(
  soffit: Of<'soffit'>,
  objects: readonly ModelObject[],
): CeilingPrism3d | null {
  const room = soffitRoom(soffit, objects);
  if (room === null) return null;
  const walls = objects.filter((o): o is Of<'wall'> => o.type === 'wall');
  const surface = ceilingSurface(room, walls);
  return {
    ring: soffit.data.geometry.boundary.map((p) => ({ x: p.x, y: p.y })),
    surface,
    bottom: { kind: 'level', z: surface.low - soffit.data.attributes.dropHeight },
    top: { kind: 'surface', offset: 0 },
    capTop: true,
    capBottom: true,
  };
}

/**
 * The boxes of a beam set: one per beam, or two for a beam crossing a vault's ridge that follows the slope. Level
 * beams sit with their bottom at Height AFF; across the ridge they are cut back to where their top meets a sloped
 * ceiling (a beam whose top is above the ridge is left out), as ceiling/section.ts draws them. The other placements
 * hang their height under the ceiling.
 */
export function beamBoxes(beam: BeamData, room: Room, walls: readonly Wall[]): BeamBox[] {
  const s = ceilingSurface(room, walls);
  const layout = beamLayout(beam, room.data);
  const a = beam.attributes;
  const w = a.width / 2;
  const across = layout.across;
  const d = bendDistance(s);
  const out: BeamBox[] = [];
  const box = (
    p: Point,
    q: Point,
    bottom: (x: Point) => number,
    top: (x: Point) => number,
  ): BeamBox => {
    const ring = [
      { x: p.x - across.x * w, y: p.y - across.y * w, at: p },
      { x: q.x - across.x * w, y: q.y - across.y * w, at: q },
      { x: q.x + across.x * w, y: q.y + across.y * w, at: q },
      { x: p.x + across.x * w, y: p.y + across.y * w, at: p },
    ];
    return [
      ...ring.map((c): Vec3 => [c.x, c.y, bottom(c.at)]),
      ...ring.map((c): Vec3 => [c.x, c.y, top(c.at)]),
    ];
  };
  for (const line of layout.beams) {
    // Cut points along the beam (0..1): its ends and where it crosses the ridge.
    const ts = [0, 1];
    if (d !== null) {
      const d0 = d(line.from);
      const d1 = d(line.to);
      if ((d0 > tol && d1 < -tol) || (d0 < -tol && d1 > tol)) ts.splice(1, 0, d0 / (d0 - d1));
    }
    const at = (t: number) => lerp(line.from, line.to, t);
    if (a.placement === 'level_in_vault') {
      const bottom = a.heightAff;
      const top = bottom + a.height;
      let t0 = 0;
      let t1 = 1;
      // As the section preview: only a beam across the ridge meets the slope along its length.
      if (s.kind === 'sloped' && a.direction === 'across_ridge') {
        if (top > s.ridge + tol) continue;
        // The ceiling along the beam is highest at a cut point; keep the stretch where it is at or above the top.
        const hs = ts.map((t) => ceilingHeightAt(s, at(t)));
        const inside = ts.map((_t, i) => hs[i]! >= top - tol);
        if (!inside.some(Boolean)) continue;
        t0 = Infinity;
        t1 = -Infinity;
        for (let i = 0; i < ts.length; i++) {
          if (inside[i]) {
            t0 = Math.min(t0, ts[i]!);
            t1 = Math.max(t1, ts[i]!);
          }
          if (i + 1 < ts.length && inside[i] !== inside[i + 1]) {
            const t = ts[i]! + ((ts[i + 1]! - ts[i]!) * (top - hs[i]!)) / (hs[i + 1]! - hs[i]!);
            t0 = Math.min(t0, t);
            t1 = Math.max(t1, t);
          }
        }
        if (t1 - t0 <= 1e-9) continue;
      }
      out.push(
        box(
          at(t0),
          at(t1),
          () => bottom,
          () => top,
        ),
      );
      continue;
    }
    for (let i = 0; i + 1 < ts.length; i++) {
      out.push(
        box(
          at(ts[i]!),
          at(ts[i + 1]!),
          (x) => ceilingHeightAt(s, x) - a.height,
          (x) => ceilingHeightAt(s, x),
        ),
      );
    }
  }
  return out;
}

/** The six faces of each box as flat x, y, z triangle positions. */
export function boxTriangles(boxes: readonly BeamBox[]): number[] {
  const out: number[] = [];
  const quad = (a: Vec3, b: Vec3, c: Vec3, e: Vec3) => out.push(...a, ...b, ...c, ...a, ...c, ...e);
  for (const k of boxes) {
    const [b0, b1, b2, b3, t0, t1, t2, t3] = k as [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
    quad(b0, b3, b2, b1);
    quad(t0, t1, t2, t3);
    quad(b0, b1, t1, t0);
    quad(b1, b2, t2, t1);
    quad(b2, b3, t3, t2);
    quad(b3, b0, t0, t3);
  }
  return out;
}
