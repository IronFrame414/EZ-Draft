// EZD-204b Build step 2 (vault/plans/EZD-204b.md section 1, Decided "openingHostUpdates"; Q-0630 rows 5, 11, 38;
// Q-0633 G12; 04 Selection, undo and flags; EZD-204a Decided `axis`, Swing meaning): after a wall edit, the openings
// of one level that went off every wall (Not on a wall, left where they stand) and the flagged ones a wall touches
// again (re-hosted, first id wins). Pure; returns new objects for the changed openings only and never mutates input.
import type { DoorSwing, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { wallLength, type WallObject } from '../walls';
import { openingOnWall, openingSpan } from './offsets';
import type { OpeningObject } from './opening';

const tol = COMPARISON_TOLERANCE_IN;
const X_AXIS: Point = { x: 1, y: 0 };

const lower = (id: string) => id.toLowerCase();
const byFirstId = <T extends { id: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => (lower(a.id) < lower(b.id) ? -1 : lower(a.id) > lower(b.id) ? 1 : 0));

// Unit start->end direction of a wall; +x when the wall is zero length (1/64").
function wallDir(w: WallObject): Point {
  const { start, end } = w.data.geometry;
  const L = wallLength(w.data.geometry);
  if (L <= tol) return X_AXIS;
  return { x: (end.x - start.x) / L, y: (end.y - start.y) / L };
}

const toggle = (s: DoorSwing): DoorSwing => (s === 'left' ? 'right' : 'left');

const sameAxis = (a: Point | null, b: Point | null): boolean =>
  a === null || b === null ? a === b : a.x === b.x && a.y === b.y;

export function openingHostUpdates(input: {
  level: string;
  walls: readonly WallObject[];
  previousWalls: readonly WallObject[];
  openings: readonly OpeningObject[];
}): OpeningObject[] {
  const lvl = lower(input.level);
  const walls = byFirstId(input.walls.filter((w) => lower(w.data.level) === lvl));
  const previous = input.previousWalls.filter((w) => lower(w.data.level) === lvl);
  const openings = byFirstId(input.openings.filter((o) => lower(o.data.level) === lvl));
  const find = (list: readonly WallObject[], id: string) =>
    list.find((w) => lower(w.id) === lower(id));

  const taken = new Map<string, [number, number][]>();
  const take = (wall: WallObject, o: OpeningObject) => {
    const span = openingSpan(o, wall);
    if (span === null) return;
    const key = lower(wall.id);
    const spans = taken.get(key) ?? [];
    spans.push([span.lo, span.hi]);
    taken.set(key, spans);
  };

  // Pass 1: openings still on their host stay; every other one is off, with the direction it last had.
  const off: [OpeningObject, Point][] = [];
  for (const o of openings) {
    const hostId = o.data.geometry.hostWallId;
    if (hostId === null) {
      off.push([o, o.data.geometry.axis ?? X_AXIS]);
      continue;
    }
    const host = find(walls, hostId);
    if (host !== undefined && openingOnWall(o, host)) {
      take(host, o);
      continue;
    }
    const last = find(previous, hostId) ?? host;
    off.push([o, last === undefined ? X_AXIS : wallDir(last)]);
  }

  // Pass 2: each off opening takes the first wall it lies on whose taken spans leave room for it.
  const out: OpeningObject[] = [];
  for (const [o, oldDir] of off) {
    const wall = walls.find((w) => {
      if (!openingOnWall(o, w)) return false;
      const span = openingSpan(o, w);
      if (span === null) return false;
      return (taken.get(lower(w.id)) ?? []).every(
        ([lo, hi]) => Math.min(span.hi, hi) - Math.max(span.lo, lo) <= tol,
      );
    });
    const g = o.data.geometry;
    const a = o.data.attributes;
    let hostWallId: string | null = null;
    let axis: Point | null = { x: oldDir.x, y: oldDir.y };
    let swing = a.swing;
    if (wall !== undefined) {
      hostWallId = wall.id;
      axis = null;
      const d = wallDir(wall);
      if (swing !== null && d.x * oldDir.x + d.y * oldDir.y < 0) swing = toggle(swing);
      take(wall, o);
    }
    if (hostWallId === g.hostWallId && sameAxis(axis, g.axis) && swing === a.swing) continue;
    out.push({
      ...o,
      data: {
        ...o.data,
        geometry: { center: { x: g.center.x, y: g.center.y }, hostWallId, axis },
        attributes: { ...a, swing },
      },
    });
  }
  return byFirstId(out);
}
