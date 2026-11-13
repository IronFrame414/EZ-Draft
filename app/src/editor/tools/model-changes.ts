// Wall and room edits as model changes (EZD-210a; vault/plans/EZD-210a.md section 3 C10-C14, Decided
// "toModelObjects", "wallEditChanges", "wallChange / roomChanges"; P120b `Change`; P205a `reconcileRooms`). Pure.
// EZD-294 Build step 13 (vault/plans/EZD-294.md Decided "wallEditChanges numbers"; Q-0625 (a); AC-EZD-294-3).
// EZD-204b Build step 7 (vault/plans/EZD-204b.md Decided "wallEditChanges"; AC-EZD-204-12): every wall edit appends
// the opening host updates of its level, in the same edit (one undo step).
// EZD-212b (vault/plans/EZD-212b.md D6).
// EZD-234 Build (S03 Move, Fixtures; 09e:7): moved fixtures and utility points are written in the same edit.
import {
  CURRENT_SCHEMA_VERSION,
  numberNewObjects,
  objectNumber,
  openingHostUpdates,
  parseStoredObject,
  raiseNumberHighs,
  reconcileRooms,
  withObjectNumber,
  type FixtureObject,
  type ModelObject,
  type NumberHighs,
  type OpeningObject,
  type RoomObject,
  type RoomReconcile,
  type UtilityPointObject,
  type WallObject,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Change, Objects } from '../model/patches';

export function newObjectId(): string {
  return crypto.randomUUID();
}

export function toModelObjects(objects: Objects, level: string): ModelObject[] {
  const lvl = level.toLowerCase();
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
    const keep =
      v.type === 'room' ||
      (v.type === 'wall' && typeof v.data.level === 'string' && v.data.level.toLowerCase() === lvl);
    if (!keep) continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok) out.push(r.object);
  }
  return out;
}

export function wallChange(wall: WallObject): Change {
  return {
    id: wall.id,
    value: {
      type: 'wall',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: wall.data as unknown as Record<string, unknown>,
    },
  };
}

const roomChange = (room: RoomObject): Change => ({
  id: room.id,
  value: {
    type: 'room',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: room.data as unknown as Record<string, unknown>,
  },
});

export function openingsOn(objects: Objects, level: string): OpeningObject[] {
  const lvl = level.toLowerCase();
  const out: OpeningObject[] = [];
  for (const [id, v] of objects) {
    const keep =
      v.type === 'opening' &&
      typeof v.data.level === 'string' &&
      v.data.level.toLowerCase() === lvl;
    if (!keep) continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok && r.object.type === 'opening') out.push(r.object);
  }
  return out;
}

export type LooseObject = FixtureObject | UtilityPointObject;

// EZD-234: the fixtures and utility points of a level.
export function looseOn(objects: Objects, level: string): LooseObject[] {
  const lvl = level.toLowerCase();
  const out: LooseObject[] = [];
  for (const [id, v] of objects) {
    if (v.type !== 'fixture' && v.type !== 'utility_point') continue;
    if (typeof v.data.level !== 'string' || v.data.level.toLowerCase() !== lvl) continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok && (r.object.type === 'fixture' || r.object.type === 'utility_point'))
      out.push(r.object);
  }
  return out;
}

export const looseChange = (o: LooseObject): Change => ({
  id: o.id,
  value: {
    type: o.type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: o.data as unknown as Record<string, unknown>,
  },
});

export const openingChange = (o: OpeningObject): Change => ({
  id: o.id,
  value: {
    type: 'opening',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: o.data as unknown as Record<string, unknown>,
  },
});

export function roomChanges(rec: RoomReconcile): Change[] {
  return [
    ...rec.create.map(roomChange),
    ...rec.update.map(roomChange),
    ...rec.delete.map((id): Change => ({ id, value: null })),
  ];
}

export function wallEditChanges(
  objects: Objects,
  level: string,
  walls: readonly WallObject[],
  newId: () => string,
  highs: NumberHighs,
): Change[] {
  if (walls.length === 0) return [];
  // EZD-294 Decided "wallEditChanges numbers": a wall already in the model keeps its stored number; a new wall
  // gets the highest + 1 of `highs` and the model's walls.
  const stored = new Map<string, ObjectValue>();
  for (const [id, v] of objects) stored.set(id.toLowerCase(), v);
  let running = raiseNumberHighs(highs, objects.values());
  const numbered = walls.map((w) => {
    const s = stored.get(w.id.toLowerCase());
    if (s === undefined) {
      const r = numberNewObjects([w], running);
      running = r.highs;
      return r.objects[0];
    }
    const n = objectNumber(s);
    return n === null ? w : withObjectNumber(w, n);
  });
  const next = toModelObjects(objects, level);
  const previousWalls = next.filter((o): o is WallObject => o.type === 'wall');
  for (const w of numbered) {
    const i = next.findIndex((o) => o.id.toLowerCase() === w.id.toLowerCase());
    if (i >= 0) next[i] = w;
    else next.push(w);
  }
  const rec = reconcileRooms(next, level, newId);
  const hosts = openingHostUpdates({
    level,
    walls: next.filter((o): o is WallObject => o.type === 'wall'),
    previousWalls,
    openings: openingsOn(objects, level),
  });
  return [...numbered.map(wallChange), ...roomChanges(rec), ...hosts.map(openingChange)];
}

// EZD-212b D6: one Move as one edit (one undo step). Walls go through `wallEditChanges`; moved openings are written
// with their re-hosting, and a door moved off every wall is flagged. EZD-234: moved fixtures and utility points
// follow.
export function moveEditChanges(
  objects: Objects,
  level: string,
  changed: readonly ModelObject[],
  newId: () => string,
  highs: NumberHighs,
): Change[] {
  if (changed.length === 0) return [];
  const loose = changed
    .filter((o): o is LooseObject => o.type === 'fixture' || o.type === 'utility_point')
    .map(looseChange);
  return [...wallAndOpeningMoves(objects, level, changed, newId, highs), ...loose];
}

function wallAndOpeningMoves(
  objects: Objects,
  level: string,
  changed: readonly ModelObject[],
  newId: () => string,
  highs: NumberHighs,
): Change[] {
  const walls = changed.filter((o): o is WallObject => o.type === 'wall');
  const openings = changed.filter((o): o is OpeningObject => o.type === 'opening');
  if (walls.length === 0 && openings.length === 0) return [];
  const next = new Map<string, ObjectValue>(objects);
  const keyOf = new Map<string, string>();
  for (const id of next.keys()) keyOf.set(id.toLowerCase(), id);
  for (const o of openings) {
    next.set(keyOf.get(o.id.toLowerCase()) ?? o.id, {
      type: 'opening',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: o.data as unknown as Record<string, unknown>,
    });
  }
  if (walls.length > 0) {
    const base = wallEditChanges(next, level, walls, newId, highs);
    const inBase = new Set(base.map((c) => c.id.toLowerCase()));
    return [...base, ...openings.filter((o) => !inBase.has(o.id.toLowerCase())).map(openingChange)];
  }
  const levelWalls = toModelObjects(objects, level).filter(
    (o): o is WallObject => o.type === 'wall',
  );
  const hosts = openingHostUpdates({
    level,
    walls: levelWalls,
    previousWalls: levelWalls,
    openings: openingsOn(next, level),
  });
  const hostOf = new Map(hosts.map((h) => [h.id.toLowerCase(), h]));
  const own = new Set(openings.map((o) => o.id.toLowerCase()));
  return [
    ...openings.map((o) => openingChange(hostOf.get(o.id.toLowerCase()) ?? o)),
    ...hosts.filter((h) => !own.has(h.id.toLowerCase())).map(openingChange),
  ];
}
