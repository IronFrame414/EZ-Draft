// EZD-212a Build step 3 (vault/plans/EZD-212a.md section 1, Decided "`typedMoveDelta`", "`moveSelection`", "Lone
// hosted opening in a move"; Q-0630 rows 8, 11, 14, 35; Q-0570; S03 Move; 03g): the Move tool's geometry. Selected
// walls move and stretch their neighbours; a selected door moves with its selected wall, and a lone hosted door
// slides along its wall. Reads and returns only changed wall and opening objects; never mutates its input.
// EZD-234 Build (S03 Move, Fixtures; 09e:7): selected fixtures and utility points move by the delta; a fixture's
// utility points stay put unless they are selected too.
import type { FixtureObject, UtilityPointObject } from '../fixtures/fixtures';
import type { OpeningObject } from '../openings/opening';
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN, pointsEqual } from '../tolerance';
import { moveWalls } from '../walls/move';
import type { WallObject } from '../walls/wall';
import { placeOnWall } from './slide';

export type MoveSelectionResult =
  | { ok: true; changed: ModelObject[] }
  | {
      ok: false;
      reason: 'not_found' | 'invalid_delta' | 'zero_length' | 'too_long' | 'join_lost';
      id: string;
    };

const lower = (id: string) => id.toLowerCase();

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

const isOpening = (o: ModelObject): o is OpeningObject => o.type === 'opening';

const isLoose = (o: ModelObject): o is FixtureObject | UtilityPointObject =>
  o.type === 'fixture' || o.type === 'utility_point';

const shift = (p: Point, d: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });

function moveLoose(o: FixtureObject | UtilityPointObject, d: Point): ModelObject {
  if (o.type === 'fixture')
    return {
      ...o,
      data: {
        ...o.data,
        geometry: { ...o.data.geometry, center: shift(o.data.geometry.center, d) },
      },
    };
  return { ...o, data: { ...o.data, geometry: { point: shift(o.data.geometry.point, d) } } };
}

export function typedMoveDelta(distance: number, direction: Point): Point | null {
  if (!Number.isFinite(distance) || !Number.isFinite(direction.x) || !Number.isFinite(direction.y))
    return null;
  if (distance < 0) return null;
  const len = Math.hypot(direction.x, direction.y);
  if (len <= COMPARISON_TOLERANCE_IN) return null;
  if (distance === 0) return { x: 0, y: 0 };
  return { x: (direction.x / len) * distance, y: (direction.y / len) * distance };
}

export function moveSelection(
  objects: readonly ModelObject[],
  ids: readonly string[],
  delta: Point,
): MoveSelectionResult {
  // (1) Nothing selected.
  if (ids.length === 0) return { ok: true, changed: [] };
  // (2) Every id names a wall or an opening.
  const wallIds: string[] = [];
  const openingIds = new Set<string>();
  const looseIds = new Set<string>();
  for (const id of ids) {
    const o = objects.find(
      (x) => (isWall(x) || isOpening(x) || isLoose(x)) && lower(x.id) === lower(id),
    );
    if (o === undefined) return { ok: false, reason: 'not_found', id };
    if (isWall(o)) wallIds.push(o.id);
    else if (isLoose(o)) looseIds.add(lower(o.id));
    else openingIds.add(lower(o.id));
  }
  // (3), (4) The delta.
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    return { ok: false, reason: 'invalid_delta', id: ids[0]! };
  if (pointsEqual(delta, { x: 0, y: 0 })) return { ok: true, changed: [] };
  // (5) The selected walls.
  const moved = moveWalls(objects, wallIds, delta);
  if (!moved.ok) {
    const reason = moved.reason === 'wall_not_found' ? 'not_found' : moved.reason;
    return { ok: false, reason, id: moved.wallId };
  }
  const walls = moved.changed;
  // (6) The selected openings, against the walls after the move.
  const swapped = new Map(walls.map((w) => [lower(w.id), w]));
  const after = objects.map((o) => swapped.get(lower(o.id)) ?? o);
  const selectedWalls = new Set(wallIds.map(lower));
  const openings: OpeningObject[] = [];
  for (const o of objects) {
    if (!isOpening(o) || !openingIds.has(lower(o.id))) continue;
    const center = o.data.geometry.center;
    const target = { x: center.x + delta.x, y: center.y + delta.y };
    const hostId = o.data.geometry.hostWallId;
    const hostAfter =
      hostId === null
        ? undefined
        : after.find((x): x is WallObject => isWall(x) && lower(x.id) === lower(hostId));
    let next: Point | null = target;
    if (hostId !== null && !selectedWalls.has(lower(hostId)) && hostAfter !== undefined) {
      const c = placeOnWall(o, hostAfter, after, target);
      next = c === null || pointsEqual(c, center) ? null : c;
    }
    if (next === null) continue;
    openings.push({
      ...o,
      data: { ...o.data, geometry: { ...o.data.geometry, center: { x: next.x, y: next.y } } },
    });
  }
  // (7) Walls first, then openings, then fixtures and utility points, each in model order.
  const loose = objects.filter((o) => isLoose(o) && looseIds.has(lower(o.id))) as (
    FixtureObject | UtilityPointObject
  )[];
  return { ok: true, changed: [...walls, ...openings, ...loose.map((o) => moveLoose(o, delta))] };
}
