// EZD-217 Build step 4 (vault/plans/EZD-217.md section 3 E1; Decided "Ids", "copyItems", "clipCenter",
// "deleteChanges", "Bearing", "pasteChanges" (1)-(3), "Errors"; Q-0630 row 19; Q-0646 (a); Q-0625 (a)): the model
// changes of Delete, Copy and Paste. Pure; values that fail `parseStoredObject` are skipped, never thrown on.
// EZD-234 Build (AC-EZD-234-3; Q-0704 "a dangling id reads as no appliance"): Delete also removes selected fixtures
// and utility points; a deleted appliance's points stay as they are and read as unlinked. Copy stays walls and
// openings.
import {
  numberNewObjects,
  openingHostUpdates,
  parseStoredObject,
  reconcileRooms,
  type ModelObject,
  type NumberHighs,
  type OpeningObject,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Change, Objects } from '../model/patches';
import {
  openingChange,
  openingsOn,
  roomChanges,
  toModelObjects,
  wallEditChanges,
} from '../tools/model-changes';

export type ClipItem = { readonly id: string; readonly value: ObjectValue };

const X_AXIS: Point = { x: 1, y: 0 };

function parse(id: string, value: ObjectValue): ModelObject | null {
  const r = parseStoredObject({
    id,
    type: value.type,
    schema_version: value.schemaVersion,
    data: value.data,
  });
  return r.ok ? r.object : null;
}

const wallsIn = (models: readonly ModelObject[]): WallObject[] =>
  models.filter((o): o is WallObject => o.type === 'wall');

const COPY_TYPES: ReadonlySet<string> = new Set(['wall', 'opening']);
const DELETE_TYPES: ReadonlySet<string> = new Set(['wall', 'opening', 'fixture', 'utility_point']);

export function copyItems(objects: Objects, level: string, ids: readonly string[]): ClipItem[] {
  return itemsOf(objects, level, ids, COPY_TYPES);
}

function itemsOf(
  objects: Objects,
  level: string,
  ids: readonly string[],
  types: ReadonlySet<string>,
): ClipItem[] {
  const lvl = level.toLowerCase();
  const byLower = new Map<string, string>();
  for (const id of objects.keys()) byLower.set(id.toLowerCase(), id);
  const seen = new Set<string>();
  const out: ClipItem[] = [];
  for (const id of ids) {
    const lower = id.toLowerCase();
    const key = byLower.get(lower);
    if (key === undefined || seen.has(lower)) continue;
    const value = objects.get(key)!;
    if (!types.has(value.type)) continue;
    const l = value.data.level;
    if (typeof l !== 'string' || l.toLowerCase() !== lvl) continue;
    seen.add(lower);
    out.push({ id: key, value });
  }
  return out;
}

export function clipCenter(clip: readonly ClipItem[]): Point | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const item of clip) {
    const o = parse(item.id, item.value);
    if (o === null) continue;
    if (o.type === 'wall') {
      add(o.data.geometry.start);
      add(o.data.geometry.end);
    } else if (o.type === 'opening') {
      add(o.data.geometry.center);
    }
  }
  if (minX === Infinity) return null;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function deleteChanges(
  objects: Objects,
  level: string,
  ids: readonly string[],
  newId: () => string,
): Change[] {
  const targets = itemsOf(objects, level, ids, DELETE_TYPES).map((i) => i.id);
  if (targets.length === 0) return [];
  const gone = new Set(targets.map((id) => id.toLowerCase()));
  const before = toModelObjects(objects, level);
  const next = before.filter((o) => !(o.type === 'wall' && gone.has(o.id.toLowerCase())));
  const rooms = roomChanges(reconcileRooms(next, level, newId));
  const host = openingHostUpdates({
    level,
    walls: wallsIn(next),
    previousWalls: wallsIn(before),
    openings: openingsOn(objects, level).filter((o) => !gone.has(o.id.toLowerCase())),
  });
  return [
    ...targets.map((id): Change => ({ id, value: null })),
    ...rooms,
    ...host.map(openingChange),
  ];
}

// Unit start->end direction of a wall; null when it has no length.
function unitDirection(w: WallObject): Point | null {
  const { start, end } = w.data.geometry;
  const L = Math.hypot(end.x - start.x, end.y - start.y);
  if (!(L > 0) || !Number.isFinite(L)) return null;
  return { x: (end.x - start.x) / L, y: (end.y - start.y) / L };
}

// A stored point moved by `d`; anything that is not a point is left for `parseStoredObject` to refuse.
function shift(p: unknown, d: Point): unknown {
  if (typeof p !== 'object' || p === null) return p;
  const q = p as { x?: unknown; y?: unknown };
  return typeof q.x === 'number' && typeof q.y === 'number'
    ? { ...q, x: q.x + d.x, y: q.y + d.y }
    : p;
}

type Rec = Record<string, unknown>;

export function pasteChanges(
  objects: Objects,
  level: string,
  clip: readonly ClipItem[],
  at: Point,
  newId: () => string,
  highs: NumberHighs,
): { changes: Change[]; ids: string[] } {
  const none = { changes: [], ids: [] };
  if (clip.length === 0 || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return none;
  const center = clipCenter(clip);
  if (center === null) return none;
  const delta = { x: at.x - center.x, y: at.y - center.y };
  const newIds = clip.map(() => newId());

  const byLower = new Map<string, string>();
  for (const id of objects.keys()) byLower.set(id.toLowerCase(), id);
  const copiedWalls = new Map<string, string>();
  clip.forEach((item, i) => {
    if (item.value.type === 'wall') copiedWalls.set(item.id.toLowerCase(), newIds[i]!);
  });

  const oldHostAxis = (hostId: string): Point | null => {
    const key = byLower.get(hostId.toLowerCase());
    if (key === undefined) return null;
    const o = parse(key, objects.get(key)!);
    return o !== null && o.type === 'wall' ? unitDirection(o) : null;
  };

  const pasted: (ModelObject | null)[] = clip.map((item, i) => {
    const type = item.value.type;
    if (type !== 'wall' && type !== 'opening') return null;
    const data = structuredClone(item.value.data) as Rec;
    data.level = level;
    const geometry = data.geometry as Rec | undefined;
    if (typeof geometry !== 'object' || geometry === null) return null;
    if (type === 'wall') {
      geometry.start = shift(geometry.start, delta);
      geometry.end = shift(geometry.end, delta);
    } else {
      geometry.center = shift(geometry.center, delta);
      const hostId = geometry.hostWallId;
      const copied = typeof hostId === 'string' ? copiedWalls.get(hostId.toLowerCase()) : undefined;
      if (copied !== undefined) {
        geometry.hostWallId = copied;
        geometry.axis = null;
      } else {
        const own = geometry.axis as Point | null | undefined;
        geometry.hostWallId = null;
        geometry.axis = (typeof hostId === 'string' ? oldHostAxis(hostId) : null) ?? own ?? X_AXIS;
      }
    }
    return parse(newIds[i]!, { ...item.value, data });
  });

  const walls = pasted.filter((o): o is WallObject => o !== null && o.type === 'wall');
  const openings = numberNewObjects(
    pasted.filter((o): o is OpeningObject => o !== null && o.type === 'opening'),
    highs,
  ).objects;
  if (walls.length === 0 && openings.length === 0) return none;

  const temp = new Map(objects);
  for (const o of openings) temp.set(o.id, openingChange(o).value!);

  let changes: Change[];
  if (walls.length > 0) {
    changes = wallEditChanges(temp, level, walls, newId, highs);
  } else {
    const levelWalls = wallsIn(toModelObjects(objects, level));
    changes = openingHostUpdates({
      level,
      walls: levelWalls,
      previousWalls: levelWalls,
      openings: openingsOn(temp, level),
    }).map(openingChange);
  }
  const inResult = new Set(changes.map((c) => c.id.toLowerCase()));
  for (const o of openings) {
    if (!inResult.has(o.id.toLowerCase())) changes.push(openingChange(o));
  }
  const kept = new Set([...walls, ...openings].map((o) => o.id));
  return { changes, ids: newIds.filter((id) => kept.has(id)) };
}
