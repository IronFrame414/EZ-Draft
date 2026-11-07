// Wall and room edits as model changes (EZD-210a; vault/plans/EZD-210a.md section 3 C10-C14, Decided
// "toModelObjects", "wallEditChanges", "wallChange / roomChanges"; P120b `Change`; P205a `reconcileRooms`). Pure.
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  reconcileRooms,
  type ModelObject,
  type RoomObject,
  type RoomReconcile,
  type WallObject,
} from '@ezdraft/geometry';
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
): Change[] {
  if (walls.length === 0) return [];
  const next = toModelObjects(objects, level);
  for (const w of walls) {
    const i = next.findIndex((o) => o.id.toLowerCase() === w.id.toLowerCase());
    if (i >= 0) next[i] = w;
    else next.push(w);
  }
  const rec = reconcileRooms(next, level, newId);
  return [...walls.map(wallChange), ...roomChanges(rec)];
}
