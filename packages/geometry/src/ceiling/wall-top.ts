// EZD-504 (S05 States "Ceiling slope changed: walls under a slope get their top edge cut to match in plan, elevations
// and 3D"; 09e "Sloped ceilings cut the tops of walls under them"; AC-EZD-504-1): the top edge of a wall under a
// sloped ceiling. Pure; model inches.
//
// The ceiling is the same surface the section preview draws (section.ts): plate height P at the low edges, ridge
// height R along the ridge line, straight between, the run on each side being the distance from the ridge line to
// the room's farthest boundary point on that side. Only single slope and vaulted rooms with a ridge above the plate
// cut walls. The profile is in the wall face frame (wall-face.ts): x along the wall from its start, y the top height.
// Heights are clamped to [P, R], so the wall ends that reach past the room outline (half the wall's thickness at a
// corner) keep the corner's height. A wall under two sloped rooms takes the higher top at each point
// (vault/build/assumptions.md EZD-504).
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { DEFAULT_WALL_HEIGHT_IN } from '../walls/wall';
import type { ModelObject, Point, RoomData, WallData } from '../schema';
import { ridgeDirection, roomPlateHeight, roomWalls } from './beams';
import { dot } from '../vec';

const tol = COMPARISON_TOLERANCE_IN;
type Room = { id: string; data: RoomData };
type Wall = { id: string; data: WallData };

/** One point of a wall's top edge: x along the wall from its start, y the height above the floor. */
export type WallTopPoint = readonly [number, number];

/** A sloped room's ceiling height as a function of the plan point; null when the room's ceiling is not sloped. */
export function slopedCeiling(room: Room, walls: readonly Wall[]): ((p: Point) => number) | null {
  const a = room.data.attributes;
  const type = a.ceilingType ?? 'flat';
  const ridge = a.ceiling?.ridge ?? null;
  if ((type !== 'vaulted' && type !== 'single_slope') || ridge === null) return null;
  // By point the low height is the lowest stored point, as the ceiling summary reads it (EZD-503 room-ceiling.ts).
  const points = a.ceiling?.heightsBy === 'point' ? a.ceiling.pointHeights : [];
  const P =
    points.length > 0
      ? Math.min(...points.map((q) => q.height))
      : (roomPlateHeight(room, walls) ?? DEFAULT_WALL_HEIGHT_IN);
  const R = ridge.height;
  if (R <= P + tol) return null;
  const u = ridgeDirection(room.data);
  const c: Point = { x: -u.y, y: u.x };
  const at = dot(ridge.start, c);
  let lo = 0;
  let hi = 0;
  for (const p of room.data.geometry.boundary) {
    lo = Math.min(lo, dot(p, c) - at);
    hi = Math.max(hi, dot(p, c) - at);
  }
  return (p: Point) => {
    const d = dot(p, c) - at;
    const run = d >= 0 ? hi : -lo;
    if (run <= tol) return R;
    const h = R - ((R - P) * Math.abs(d)) / run;
    return Math.min(R, Math.max(P, h));
  };
}

/** The x values along the wall where a sloped room's ceiling bends: the ridge line and the two clamp lines. */
function bends(room: Room, start: Point, along: Point, length: number): number[] {
  const ridge = room.data.attributes.ceiling!.ridge!;
  const u = ridgeDirection(room.data);
  const c: Point = { x: -u.y, y: u.x };
  const at = dot(ridge.start, c);
  const k = dot(along, c);
  if (Math.abs(k) <= 1e-9) return [];
  let lo = 0;
  let hi = 0;
  for (const p of room.data.geometry.boundary) {
    lo = Math.min(lo, dot(p, c) - at);
    hi = Math.max(hi, dot(p, c) - at);
  }
  const s0 = dot(start, c) - at;
  return [0, lo, hi].map((d) => (d - s0) / k).filter((x) => x > tol && x < length - tol);
}

/**
 * The top edge of a wall under one or more sloped ceilings, start to end, as face-frame points with x ascending from 0
 * to the wall's length; null when no sloped room's ceiling is over the wall (the wall keeps its own height).
 */
export function wallTopProfile(wall: Wall, objects: readonly ModelObject[]): WallTopPoint[] | null {
  const walls = objects.filter((o): o is Extract<ModelObject, { type: 'wall' }> => o.type === 'wall');
  const rooms = objects.filter((o): o is Extract<ModelObject, { type: 'room' }> => o.type === 'room');
  const { start, end } = wall.data.geometry;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length <= tol) return null;
  const along = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const id = wall.id.toLowerCase();

  const surfaces: ((p: Point) => number)[] = [];
  const xs = new Set<number>([0, length]);
  for (const room of rooms) {
    if (!roomWalls(room, walls).some((w) => w.id.toLowerCase() === id)) continue;
    const h = slopedCeiling(room, walls);
    if (h === null) continue;
    surfaces.push(h);
    for (const x of bends(room, start, along, length)) xs.add(x);
  }
  if (surfaces.length === 0) return null;

  const point = (x: number): Point => ({ x: start.x + along.x * x, y: start.y + along.y * x });
  const top = (x: number) => Math.max(...surfaces.map((h) => h(point(x))));
  const sorted = [...xs].sort((a, b) => a - b);
  // Where two rooms' ceilings cross between two bends, the higher one changes: add the crossing.
  if (surfaces.length > 1) {
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      for (let m = 0; m < surfaces.length; m++)
        for (let n = m + 1; n < surfaces.length; n++) {
          const fa = surfaces[m]!(point(a)) - surfaces[n]!(point(a));
          const fb = surfaces[m]!(point(b)) - surfaces[n]!(point(b));
          if ((fa > tol && fb < -tol) || (fa < -tol && fb > tol)) xs.add(a + ((b - a) * fa) / (fa - fb));
        }
    }
  }
  const out: WallTopPoint[] = [];
  for (const x of [...xs].sort((a, b) => a - b)) {
    const y = top(x);
    const prev = out[out.length - 2];
    const last = out[out.length - 1];
    // A point on the straight line through the one before and the next adds nothing: drop the middle one.
    if (prev !== undefined && last !== undefined) {
      const onLine = prev[1] + ((y - prev[1]) * (last[0] - prev[0])) / (x - prev[0]);
      if (Math.abs(onLine - last[1]) <= tol) out.pop();
    }
    out.push([x, y]);
  }
  return out;
}
