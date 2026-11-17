// EZD-226 Build (Q-0704 03-data-model "tile_shower ... Drain, niche and glass positions are in the shower's own frame,
// so they move with it"; AC-EZD-226-1, -3; vault/build/assumptions.md EZD-226): the tile shower object type, its frame
// and the world positions of its drain, niches, glass, curb and bench, which the plan draws. The frame is the one
// schema/tile-shower.ts names: origin footprint[0], x toward footprint[1], y toward footprint[3]; side i is the edge
// from footprint[i] to footprint[(i + 1) % 4]. Where the schema stores no position along a side, the placement here is
// the recorded assumption: niches are centred on their side, glass pieces run end to end from the side's start, the
// curb lies inside side 0 and a bench sits against side 3 (the left wall) in the back corner at footprint[3]. Pure.
import type { Point } from '../schema';
import type { TileShowerData } from '../schema/tile-shower';

export type TileShowerObject = { id: string; type: 'tile_shower'; data: TileShowerData };

// The plan depth of a niche behind its wall face, one 2x4 stud bay (vault/build/assumptions.md EZD-226).
export const NICHE_DEPTH_IN = 3.5;
// The width across a linear drain's grate and the diameter of a center drain's mark.
export const LINEAR_DRAIN_WIDTH_IN = 2.5;
export const CENTER_DRAIN_MARK_IN = 4;

export type ShowerFrame = { origin: Point; ux: Point; uy: Point; width: number; depth: number };

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const unit = (a: Point): Point => {
  const l = Math.hypot(a.x, a.y);
  return { x: a.x / l, y: a.y / l };
};

export function showerFrame(footprint: readonly Point[]): ShowerFrame {
  const [p0, p1, , p3] = footprint as [Point, Point, Point, Point];
  const ex = sub(p1, p0);
  const ey = sub(p3, p0);
  return {
    origin: { x: p0.x, y: p0.y },
    ux: unit(ex),
    uy: unit(ey),
    width: Math.hypot(ex.x, ex.y),
    depth: Math.hypot(ey.x, ey.y),
  };
}

// A point in the shower's frame, in model inches.
export function frameToWorld(f: ShowerFrame, p: Point): Point {
  return add(f.origin, add(scale(f.ux, p.x), scale(f.uy, p.y)));
}

export type ShowerSide = { start: Point; end: Point; dir: Point; inward: Point; length: number };

// Side i of the footprint, with the unit normal pointing into the shower.
export function showerSide(footprint: readonly Point[], side: number): ShowerSide {
  const start = footprint[side]!;
  const end = footprint[(side + 1) % 4]!;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const dir = unit(sub(end, start));
  const mid = scale(add(footprint[0]!, footprint[2]!), 0.5);
  let inward = { x: -dir.y, y: dir.x };
  const toMid = sub(mid, start);
  if (inward.x * toMid.x + inward.y * toMid.y < 0) inward = scale(inward, -1);
  return { start: { ...start }, end: { ...end }, dir, inward, length };
}

const along = (s: ShowerSide, t: number, inset = 0): Point =>
  add(add(s.start, scale(s.dir, t)), scale(s.inward, inset));

export type ShowerDrainAt =
  { type: 'center'; at: Point } | { type: 'linear'; side: number; from: Point; to: Point };

// The drain in model inches: a center drain's point, or a linear drain's run along its side face.
export function showerDrainAt(data: TileShowerData): ShowerDrainAt {
  const d = data.attributes.drain;
  const fp = data.geometry.footprint;
  if (d.type === 'center') return { type: 'center', at: frameToWorld(showerFrame(fp), d.at) };
  const s = showerSide(fp, d.side);
  return {
    type: 'linear',
    side: d.side,
    from: along(s, d.offset),
    to: along(s, d.offset + d.length),
  };
}

// Each niche's opening on its side face, centred on the side.
export function showerNichesAt(data: TileShowerData): { side: number; from: Point; to: Point }[] {
  return data.attributes.niches.map((n) => {
    const s = showerSide(data.geometry.footprint, n.side);
    const start = (s.length - n.width) / 2;
    return { side: n.side, from: along(s, start), to: along(s, start + n.width) };
  });
}

export type ShowerGlassAt = {
  type: 'fixed' | 'door';
  side: number;
  from: Point;
  to: Point;
  inward: Point;
  swing: 'in' | 'out' | null;
};

// Each glass piece on its side; pieces on one side run end to end from the side's start, in list order.
export function showerGlassAt(data: TileShowerData): ShowerGlassAt[] {
  const used = [0, 0, 0, 0];
  return data.attributes.glass.map((g) => {
    const s = showerSide(data.geometry.footprint, g.side);
    const t = used[g.side]!;
    used[g.side] = t + g.length;
    return {
      type: g.type,
      side: g.side,
      from: along(s, t),
      to: along(s, t + g.length),
      inward: s.inward,
      swing: g.type === 'door' ? g.swing : null,
    };
  });
}

// The curb's inner edge, its width inside side 0; null when curbless.
export function showerCurbAt(data: TileShowerData): { from: Point; to: Point } | null {
  const c = data.attributes.curb;
  if (c === null) return null;
  const s = showerSide(data.geometry.footprint, 0);
  return { from: along(s, 0, c.width), to: along(s, s.length, c.width) };
}

// The bench outline against side 3 in the back corner at footprint[3]: its width runs along the wall, its depth out
// from it; null when there is none.
export function showerBenchAt(data: TileShowerData): [Point, Point, Point, Point] | null {
  const b = data.attributes.bench;
  if (b === null) return null;
  const f = showerFrame(data.geometry.footprint);
  const w = (p: Point) => frameToWorld(f, p);
  return [
    w({ x: 0, y: f.depth - b.width }),
    w({ x: b.depth, y: f.depth - b.width }),
    w({ x: b.depth, y: f.depth }),
    w({ x: 0, y: f.depth }),
  ];
}

// The shower moved by `d`: only the footprint changes, so everything stored in its frame moves with it.
export function moveTileShower(o: TileShowerObject, d: Point): TileShowerObject {
  return {
    ...o,
    data: {
      ...o.data,
      geometry: { footprint: o.data.geometry.footprint.map((p) => add(p, d)) },
    },
  };
}
