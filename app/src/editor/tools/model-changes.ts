// Wall and room edits as model changes (EZD-210a; vault/plans/EZD-210a.md section 3 C10-C14, Decided
// "toModelObjects", "wallEditChanges", "wallChange / roomChanges"; P120b `Change`; P205a `reconcileRooms`). Pure.
// EZD-294 Build step 13 (vault/plans/EZD-294.md Decided "wallEditChanges numbers"; Q-0625 (a); AC-EZD-294-3).
import {
  CURRENT_SCHEMA_VERSION,
  numberNewObjects,
  objectNumber,
  parseStoredObject,
  raiseNumberHighs,
  reconcileRooms,
  withObjectNumber,
  type ModelObject,
  type NumberHighs,
  type RoomObject,
  type RoomReconcile,
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
  for (const w of numbered) {
    const i = next.findIndex((o) => o.id.toLowerCase() === w.id.toLowerCase());
    if (i >= 0) next[i] = w;
    else next.push(w);
  }
  const rec = reconcileRooms(next, level, newId);
  return [...numbered.map(wallChange), ...roomChanges(rec)];
}
