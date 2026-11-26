// EZD-212a Build step 3 (vault/plans/EZD-212a.md section 1, Decided "`typedMoveDelta`", "`moveSelection`", "Lone
// hosted opening in a move"; Q-0630 rows 8, 11, 14, 35; Q-0570; S03 Move; 03g): the Move tool's geometry. Selected
// walls move and stretch their neighbours; a selected door moves with its selected wall, and a lone hosted door
// slides along its wall. Reads and returns only changed wall and opening objects; never mutates its input.
// EZD-234 Build (S03 Move, Fixtures; 09e:7): selected fixtures and utility points move by the delta; a fixture's
// utility points stay put unless they are selected too.
// EZD-226 Build (AC-EZD-226-3): a selected tile shower moves its footprint; its drain, niches and glass are in its
// own frame, so they move with it.
// EZD-227 Build (AC-EZD-227-1): blocking moves as an opening does: with its selected wall by the delta, alone along
// its wall, or by the delta when it is on no wall.
// EZD-216 (S03 rail Dimension "then adjustable"; 09-calculations Q-0664 "a user offset kept after a move"; AC-EZD-216-4):
// a selected dimension's drag changes its offset only (the move's part along its outward normal; an angular one moves
// the point its arc passes through), and a selected note moves its position while its leader's arrow end stays.
import { roomInsideBox, wallsOuterBox } from '../dimensions/auto';
import { measureDimension, type DimensionObject } from '../dimensions/measure';
import type { TextObject } from '../dimensions/items';
import { placeBlockingOnWall, type BlockingObject } from '../fixtures/blocking';
import type { FixtureObject, UtilityPointObject } from '../fixtures/fixtures';
import { moveTileShower, type TileShowerObject } from '../fixtures/tile-shower';
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

const isBlocking = (o: ModelObject): o is BlockingObject => o.type === 'blocking';

// EZD-602 (S06 Controls "Canvas drag device | Canvas | Moves device; live distances."): an electrical device moves
// by the delta as a utility point does (both are a point).
type DeviceObject = Extract<ModelObject, { type: 'device' }>;
type Loose = FixtureObject | UtilityPointObject | TileShowerObject | DeviceObject;

const isLoose = (o: ModelObject): o is Loose =>
  o.type === 'fixture' ||
  o.type === 'utility_point' ||
  o.type === 'tile_shower' ||
  o.type === 'device';

const shift = (p: Point, d: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });

function moveLoose(o: Loose, d: Point): ModelObject {
  if (o.type === 'tile_shower') return moveTileShower(o, d);
  if (o.type === 'fixture')
    return {
      ...o,
      data: {
        ...o.data,
        geometry: { ...o.data.geometry, center: shift(o.data.geometry.center, d) },
      },
    };
  // A utility point or a device: one point.
  return {
    ...o,
    data: { ...o.data, geometry: { point: shift(o.data.geometry.point, d) } },
  } as ModelObject;
}

const isAnnotation = (o: ModelObject): o is DimensionObject | TextObject =>
  o.type === 'dimension' || o.type === 'text';

function moveAnnotation(
  o: DimensionObject | TextObject,
  d: Point,
  objects: readonly ModelObject[],
): ModelObject | null {
  if (o.type === 'text')
    return {
      ...o,
      data: { ...o.data, geometry: { ...o.data.geometry, position: shift(o.data.geometry.position, d) } },
    };
  const g = o.data.geometry;
  if (g.kind === 'walls')
    return { ...o, data: { ...o.data, geometry: { ...g, at: shift(g.at, d) } } };
  const level = lower(o.data.level);
  const on = (x: ModelObject) => 'level' in x.data && lower((x.data as { level: string }).level) === level;
  const walls = objects.filter((x): x is WallObject => isWall(x) && on(x));
  const m = measureDimension(o.data, {
    wall: (id) => walls.find((w) => lower(w.id) === lower(id)) ?? null,
    roomBox: (id) => {
      const r = objects.find((x) => x.type === 'room' && lower(x.id) === lower(id));
      return r === undefined || r.type !== 'room' ? null : roomInsideBox(r);
    },
    floorBox: () => wallsOuterBox(walls),
  });
  if (m === null || m.kind !== 'linear') return null;
  const along = d.x * m.normal.x + d.y * m.normal.y;
  if (Math.abs(along) <= COMPARISON_TOLERANCE_IN) return null;
  return {
    ...o,
    data: { ...o.data, attributes: { ...o.data.attributes, offset: o.data.attributes.offset + along } },
  };
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
  const blockingIds = new Set<string>();
  const annotationIds = new Set<string>();
  for (const id of ids) {
    const o = objects.find(
      (x) =>
        (isWall(x) || isOpening(x) || isLoose(x) || isBlocking(x) || isAnnotation(x)) &&
        lower(x.id) === lower(id),
    );
    if (o === undefined) return { ok: false, reason: 'not_found', id };
    if (isAnnotation(o)) annotationIds.add(lower(o.id));
    else if (isWall(o)) wallIds.push(o.id);
    else if (isLoose(o)) looseIds.add(lower(o.id));
    else if (isBlocking(o)) blockingIds.add(lower(o.id));
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
  // (6b) The selected blocking, by the same rule.
  const blockings: BlockingObject[] = [];
  for (const o of objects) {
    if (!isBlocking(o) || !blockingIds.has(lower(o.id))) continue;
    const center = o.data.geometry.center;
    const target = { x: center.x + delta.x, y: center.y + delta.y };
    const hostId = o.data.geometry.hostWallId;
    const hostAfter =
      hostId === null
        ? undefined
        : after.find((x): x is WallObject => isWall(x) && lower(x.id) === lower(hostId));
    let next: Point | null = target;
    if (hostId !== null && !selectedWalls.has(lower(hostId)) && hostAfter !== undefined) {
      const c = placeBlockingOnWall(o, hostAfter, after, target);
      next = c === null || pointsEqual(c, center) ? null : c;
    }
    if (next === null) continue;
    blockings.push({
      ...o,
      data: { ...o.data, geometry: { ...o.data.geometry, center: { x: next.x, y: next.y } } },
    });
  }
  // (7) Walls first, then openings, then blocking, then fixtures and utility points, each in model order.
  const loose = objects.filter((o) => isLoose(o) && looseIds.has(lower(o.id))) as Loose[];
  // (8) EZD-216: then the selected dimensions and notes, against the walls before the move.
  const annotations = objects
    .filter((o): o is DimensionObject | TextObject => isAnnotation(o) && annotationIds.has(lower(o.id)))
    .flatMap((o) => {
      const m = moveAnnotation(o, delta, objects);
      return m === null ? [] : [m];
    });
  return {
    ok: true,
    changed: [
      ...walls,
      ...openings,
      ...blockings,
      ...loose.map((o) => moveLoose(o, delta)),
      ...annotations,
    ],
  };
}
