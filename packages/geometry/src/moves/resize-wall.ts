// EZD-212a Build step 5 (vault/plans/EZD-212a.md section 1, Decided "`endDragLength`", "`resizeWall`", "Start-handle
// openings"; Q-0630 row 12; 09k Typed length; 09j Absorbing row 2; Q-0570; Q-0598 (b)): a wall end handle and a typed
// length move one end; the far end stays and the walls joined at the moved corner follow. Reads and returns only
// changed wall and opening objects; never mutates its input.
import type { OpeningObject } from '../openings/opening';
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN, pointsEqual } from '../tolerance';
import { findWallJoins, type WallEnd, type WallJoin } from '../walls/joins';
import { moveWalls } from '../walls/move';
import { wallLength, wallLengthProblem, type WallObject } from '../walls/wall';

export type ResizeWallResult =
  | { ok: true; changed: ModelObject[] }
  | {
      ok: false;
      reason: 'wall_not_found' | 'invalid_length' | 'zero_length' | 'too_long' | 'join_lost';
      wallId: string;
    };

const tol = COMPARISON_TOLERANCE_IN;

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

const isOpening = (o: ModelObject): o is OpeningObject => o.type === 'opening';

const otherEndOf = (e: WallEnd): WallEnd => (e === 'start' ? 'end' : 'start');

function sameJoin(a: WallJoin, b: WallJoin): boolean {
  if (a.kind !== b.kind || !sameId(a.otherId, b.otherId)) return false;
  if (a.kind === 'corner' && b.kind === 'corner')
    return a.end === b.end && a.otherEnd === b.otherEnd;
  if (a.kind === 'tee-on' && b.kind === 'tee-on') return a.otherEnd === b.otherEnd;
  if (a.kind === 'tee-into' && b.kind === 'tee-into') return a.end === b.end;
  return true;
}

// The fixed end and the unit direction from it to `end`; null for a wall of length 1/64" or less.
function fromFixed(wall: WallObject, end: WallEnd): { fixed: Point; u: Point } | null {
  const line = wall.data.geometry;
  const L = wallLength(line);
  if (L <= tol) return null;
  const fixed = line[otherEndOf(end)];
  const moving = line[end];
  return { fixed, u: { x: (moving.x - fixed.x) / L, y: (moving.y - fixed.y) / L } };
}

export function endDragLength(wall: WallObject, end: WallEnd, point: Point): number {
  const dir = fromFixed(wall, end);
  if (dir === null) return 0;
  const { fixed, u } = dir;
  return (point.x - fixed.x) * u.x + (point.y - fixed.y) * u.y;
}

export function resizeWall(
  objects: readonly ModelObject[],
  wallId: string,
  end: WallEnd,
  length: number,
): ResizeWallResult {
  // (1) The wall.
  const wall = objects.find((o): o is WallObject => isWall(o) && sameId(o.id, wallId));
  if (wall === undefined) return { ok: false, reason: 'wall_not_found', wallId };
  // (2) The typed length.
  if (!Number.isFinite(length)) return { ok: false, reason: 'invalid_length', wallId: wall.id };
  const problem = wallLengthProblem(length);
  if (problem !== null) return { ok: false, reason: problem, wallId: wall.id };
  // (3) A zero-length wall has no direction.
  const dir = fromFixed(wall, end);
  if (dir === null) return { ok: false, reason: 'zero_length', wallId: wall.id };
  // (4) The moved end.
  const { fixed, u } = dir;
  const newEnd = { x: fixed.x + u.x * length, y: fixed.y + u.y * length };
  const old = wall.data.geometry[end];
  const delta = { x: newEnd.x - old.x, y: newEnd.y - old.y };
  if (pointsEqual(delta, { x: 0, y: 0 })) return { ok: true, changed: [] };
  // (5) The walls cornered at the moved end move; this wall stretches as their neighbour.
  const level = wall.data.level.toLowerCase();
  const levelWalls = objects.filter(
    (o): o is WallObject => isWall(o) && o.data.level.toLowerCase() === level,
  );
  const before = findWallJoins(levelWalls, wall.id);
  const cornerIds = before.flatMap((j) =>
    j.kind === 'corner' && j.end === end ? [j.otherId] : [],
  );
  let walls: WallObject[];
  if (cornerIds.length > 0) {
    const r = moveWalls(objects, cornerIds, delta);
    if (!r.ok) {
      const reason = r.reason === 'invalid_delta' ? 'invalid_length' : r.reason;
      return { ok: false, reason, wallId: r.wallId };
    }
    walls = r.changed;
  } else {
    const g = wall.data.geometry;
    const resized: WallObject = {
      id: wall.id,
      type: 'wall',
      data: {
        ...wall.data,
        geometry: {
          start: end === 'start' ? newEnd : { x: g.start.x, y: g.start.y },
          end: end === 'end' ? newEnd : { x: g.end.x, y: g.end.y },
        },
      },
    };
    const lengthProblem = wallLengthProblem(wallLength(resized.data.geometry));
    if (lengthProblem !== null) return { ok: false, reason: lengthProblem, wallId: wall.id };
    const afterWalls = levelWalls.map((w) => (w === wall ? resized : w));
    const after = findWallJoins(afterWalls, wall.id);
    if (!before.every((j) => after.some((k) => sameJoin(j, k))))
      return { ok: false, reason: 'join_lost', wallId: wall.id };
    walls = [resized];
  }
  // (6) Offsets from the start corner never shift: a moved start carries the wall's openings.
  const openings: OpeningObject[] = [];
  if (end === 'start') {
    for (const o of objects) {
      if (!isOpening(o)) continue;
      const host = o.data.geometry.hostWallId;
      if (host === null || !sameId(host, wall.id)) continue;
      const c = o.data.geometry.center;
      openings.push({
        ...o,
        data: {
          ...o.data,
          geometry: { ...o.data.geometry, center: { x: c.x + delta.x, y: c.y + delta.y } },
        },
      });
    }
  }
  // (7) Walls, then openings in model order.
  return { ok: true, changed: [...walls, ...openings] };
}
