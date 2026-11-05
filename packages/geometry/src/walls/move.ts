// EZD-203 Build step 9 (vault/plans/EZD-203.md section 3 `walls/move.ts`, Decided "Move algorithm", "Delta", "Hosted
// items", "Purity", "Ids"; 09e; 12 Wall move; 09j Moving a wall; Q-0570; Q-0583 (a); Q-0598 (b)): moving a wall
// stretches the walls joined to it; hosted items do not move. Reads and returns only wall objects; never mutates its
// input.
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN, pointsEqual } from '../tolerance';
import { findWallJoins, type WallJoin } from './joins';
import { wallLength, wallLengthProblem, type WallLine, type WallObject } from './wall';

export type MoveWallResult =
  | { ok: true; changed: WallObject[] }
  | {
      ok: false;
      reason: 'wall_not_found' | 'invalid_delta' | 'zero_length' | 'too_long' | 'join_lost';
      wallId: string;
    };

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

const add = (p: Point, d: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });

// Distance from `p` to the segment, its ends included.
function pointSegmentDistance(p: Point, line: WallLine): number {
  const length = wallLength(line);
  if (length === 0) return Math.hypot(p.x - line.start.x, p.y - line.start.y);
  const dx = (line.end.x - line.start.x) / length;
  const dy = (line.end.y - line.start.y) / length;
  const along = Math.min(
    length,
    Math.max(0, (p.x - line.start.x) * dx + (p.y - line.start.y) * dy),
  );
  return Math.hypot(p.x - (line.start.x + dx * along), p.y - (line.start.y + dy * along));
}

// True when `p` is within 1/64" of the segment, its ends included.
const onSegment = (p: Point, line: WallLine) =>
  pointSegmentDistance(p, line) <= COMPARISON_TOLERANCE_IN;

// 0 when the segments intersect, else the least of the four end-to-other-segment distances.
function segmentDistance(a: WallLine, b: WallLine): number {
  const ax = a.end.x - a.start.x;
  const ay = a.end.y - a.start.y;
  const bx = b.end.x - b.start.x;
  const by = b.end.y - b.start.y;
  const denom = ax * by - ay * bx;
  if (denom !== 0) {
    const sx = b.start.x - a.start.x;
    const sy = b.start.y - a.start.y;
    const t = (sx * by - sy * bx) / denom;
    const u = (sx * ay - sy * ax) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegmentDistance(a.start, b),
    pointSegmentDistance(a.end, b),
    pointSegmentDistance(b.start, a),
    pointSegmentDistance(b.end, a),
  );
}

function joinHolds(line: WallLine, join: WallJoin, otherLine: WallLine): boolean {
  if (join.kind === 'corner') return pointsEqual(line[join.end], otherLine[join.otherEnd]);
  if (join.kind === 'tee-on') return onSegment(otherLine[join.otherEnd], line);
  if (join.kind === 'tee-into') return onSegment(line[join.end], otherLine);
  return segmentDistance(line, otherLine) <= COMPARISON_TOLERANCE_IN;
}

export function moveWall(
  objects: readonly ModelObject[],
  wallId: string,
  delta: { x: number; y: number },
): MoveWallResult {
  const moved = objects.find((o): o is WallObject => isWall(o) && sameId(o.id, wallId));
  if (moved === undefined) return { ok: false, reason: 'wall_not_found', wallId };
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    return { ok: false, reason: 'invalid_delta', wallId };
  if (pointsEqual(delta, { x: 0, y: 0 })) return { ok: true, changed: [] };

  const level = moved.data.level.toLowerCase();
  const walls = objects.filter(
    (o): o is WallObject => isWall(o) && o.data.level.toLowerCase() === level,
  );
  const joins = findWallJoins(walls, moved.id);

  const lines = new Map<WallObject, WallLine>();
  const lineOf = (w: WallObject): WallLine => lines.get(w) ?? w.data.geometry;
  const byId = (id: string) => walls.find((w) => sameId(w.id, id));

  const g = moved.data.geometry;
  const movedLine: WallLine = { start: add(g.start, delta), end: add(g.end, delta) };
  lines.set(moved, movedLine);
  for (const join of joins) {
    if (join.kind === 'tee-into' || join.kind === 'cross') continue;
    const other = byId(join.otherId);
    if (other === undefined) continue;
    const current = lineOf(other);
    const point =
      join.kind === 'corner'
        ? { x: movedLine[join.end].x, y: movedLine[join.end].y }
        : add(current[join.otherEnd], delta);
    lines.set(other, { ...current, [join.otherEnd]: point });
  }

  const changedWalls = [moved, ...walls.filter((w) => w !== moved && lines.has(w))];

  for (const w of changedWalls) {
    const problem = wallLengthProblem(wallLength(lineOf(w)));
    if (problem !== null) return { ok: false, reason: problem, wallId: w.id };
  }

  for (const w of changedWalls) {
    for (const join of findWallJoins(walls, w.id)) {
      const other = byId(join.otherId);
      if (other === undefined || !joinHolds(lineOf(w), join, lineOf(other)))
        return { ok: false, reason: 'join_lost', wallId: w.id };
    }
  }

  return {
    ok: true,
    changed: changedWalls.map((w) => {
      const line = lineOf(w);
      return {
        id: w.id,
        type: 'wall',
        data: {
          ...w.data,
          geometry: {
            start: { x: line.start.x, y: line.start.y },
            end: { x: line.end.x, y: line.end.y },
          },
        },
      };
    }),
  };
}
