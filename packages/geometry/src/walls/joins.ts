// EZD-203 Build step 8 (vault/plans/EZD-203.md section 3 `walls/joins.ts`, Decided "Joins", "Join order", "Ids",
// "Degenerate walls"; 09e; 00e Join; Q-0570; Q-0598 (a); 03g): where the walls of one level meet one wall,
// crossings included.
import type { Point } from '../schema';
import { COMPARISON_TOLERANCE_IN, pointsEqual } from '../tolerance';
import { wallLength, type WallLine, type WallObject } from './wall';

export type WallEnd = 'start' | 'end';

export type WallJoin =
  | { kind: 'corner'; end: WallEnd; otherId: string; otherEnd: WallEnd }
  | { kind: 'tee-on'; otherId: string; otherEnd: WallEnd }
  | { kind: 'tee-into'; end: WallEnd; otherId: string }
  | { kind: 'cross'; otherId: string };

const ENDS: readonly WallEnd[] = ['start', 'end'];

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const degenerate = (w: WallObject) => wallLength(w.data.geometry) <= COMPARISON_TOLERANCE_IN;

// True when `p` lies on the line's interior: within 1/64" of it, projecting strictly between its ends and not on
// either end.
function onInterior(p: Point, line: WallLine): boolean {
  const length = wallLength(line);
  const dx = (line.end.x - line.start.x) / length;
  const dy = (line.end.y - line.start.y) / length;
  const px = p.x - line.start.x;
  const py = p.y - line.start.y;
  const along = px * dx + py * dy;
  const across = Math.abs(px * -dy + py * dx);
  return (
    across <= COMPARISON_TOLERANCE_IN &&
    along > 0 &&
    along < length &&
    !pointsEqual(p, line.start) &&
    !pointsEqual(p, line.end)
  );
}

// True when the two drawn lines are not parallel (exact) and their intersection point is interior to both.
function crosses(a: WallLine, b: WallLine): boolean {
  const ax = a.end.x - a.start.x;
  const ay = a.end.y - a.start.y;
  const bx = b.end.x - b.start.x;
  const by = b.end.y - b.start.y;
  const denom = ax * by - ay * bx;
  if (denom === 0) return false;
  const t = ((b.start.x - a.start.x) * by - (b.start.y - a.start.y) * bx) / denom;
  const p = { x: a.start.x + t * ax, y: a.start.y + t * ay };
  return onInterior(p, a) && onInterior(p, b);
}

export function findWallJoins(walls: readonly WallObject[], wallId: string): WallJoin[] {
  const self = walls.find((w) => sameId(w.id, wallId));
  if (self === undefined || degenerate(self)) return [];
  const level = self.data.level.toLowerCase();
  const line = self.data.geometry;
  const joins: WallJoin[] = [];
  for (const other of walls) {
    if (other === self || sameId(other.id, self.id)) continue;
    if (other.data.level.toLowerCase() !== level || degenerate(other)) continue;
    const otherLine = other.data.geometry;
    const before = joins.length;
    for (const end of ENDS) {
      for (const otherEnd of ENDS) {
        if (pointsEqual(line[end], otherLine[otherEnd]))
          joins.push({ kind: 'corner', end, otherId: other.id, otherEnd });
      }
    }
    for (const otherEnd of ENDS) {
      if (onInterior(otherLine[otherEnd], line))
        joins.push({ kind: 'tee-on', otherId: other.id, otherEnd });
    }
    for (const end of ENDS) {
      if (onInterior(line[end], otherLine))
        joins.push({ kind: 'tee-into', end, otherId: other.id });
    }
    if (joins.length === before && crosses(line, otherLine))
      joins.push({ kind: 'cross', otherId: other.id });
  }
  return joins;
}
