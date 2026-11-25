// EZD-229 (AC-EZD-229-1, -4, -5; Q-0704 "Transitions are derived, never stored", "Room gains ... photos (source_file
// ids)"; 09q Transitions): the Rooms tab's transitions for one room, its photo edit and its floor level text. Only the
// lazy room fields use these (11 Budgets), so the left panel's room list does not parse every object. No React.
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  type ModelObject,
  type RoomObject,
} from '@ezdraft/geometry';
// App code used only by the lazy room fields and plan details (floor-transitions.ts; 11 Budgets).
import {
  formatSignedLength,
  parseSignedLength,
  roomTransitions,
  transitionsOfRoom,
} from './floor-transitions';
import type { Change, Objects } from '../model/patches';

// One transition of a room: the other room's name and the level step at 1/16", or null when only the finish changes.
export type RoomTransitionRow = { otherRoomId: string; otherRoomName: string; step: string | null };

// The floor level as the field shows it (detail precision, 1/16"; below 0 with −).
export function floorLevelText(inches: number): string {
  return formatSignedLength(inches, 16);
}

// The transitions between one room and the rooms next to it on its floor, worked out from the model each time.
export function roomTransitionRows(objects: Objects, roomId: string): RoomTransitionRow[] {
  const parsed: ModelObject[] = [];
  for (const [id, v] of objects) {
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    if (r.ok) parsed.push(r.object);
  }
  const key = roomId.toLowerCase();
  const room = parsed.find((o) => o.type === 'room' && o.id.toLowerCase() === key);
  if (room === undefined || room.type !== 'room') return [];
  const names = new Map(
    parsed.flatMap((o) => (o.type === 'room' ? [[o.id.toLowerCase(), o.data.attributes.name]] : [])),
  );
  return transitionsOfRoom(roomTransitions(parsed, room.data.level), roomId).map((t) => {
    const other = t.roomIds[0].toLowerCase() === key ? t.roomIds[1] : t.roomIds[0];
    return { otherRoomId: other, otherRoomName: names.get(other.toLowerCase()) ?? '', step: t.label };
  });
}

// The room's stored floor level and photos (0 and none for an unknown room).
export function roomFloorAndPhotos(objects: Objects, id: string): { floorLevel: number; photos: string[] } {
  const found = parsedRoomOf(objects, id);
  const a = found?.[1].data.attributes;
  return { floorLevel: a?.floorLevel ?? 0, photos: a ? [...a.photos] : [] };
}

// The change that sets a room's floor level from typed text (any signed length, stored to 1/16" with the 03g halfway
// rule, no limit), or null when the text is not a length, the room is unknown, or the level does not change.
export function roomFloorLevelChange(objects: Objects, id: string, text: string): Change | null {
  const r = parseSignedLength(text);
  if (!r.ok) return null;
  const found = parsedRoomOf(objects, id);
  if (found === null) return null;
  const [key, room] = found;
  if (room.data.attributes.floorLevel === r.inches) return null;
  return roomChange(key, room, { ...room.data.attributes, floorLevel: r.inches });
}

function parsedRoomOf(objects: Objects, id: string): [string, RoomObject] | null {
  const key = [...objects.keys()].find((k) => k.toLowerCase() === id.toLowerCase());
  if (key === undefined) return null;
  const v = objects.get(key)!;
  const r = parseStoredObject({ id: key, type: v.type, schema_version: v.schemaVersion, data: v.data });
  return r.ok && r.object.type === 'room' ? [key, r.object as RoomObject] : null;
}

// The change that adds one finished photo upload to a room, or null for an unknown room or a photo it already has.
export function roomPhotoChange(objects: Objects, id: string, fileId: string): Change | null {
  const found = parsedRoomOf(objects, id);
  if (found === null) return null;
  const [key, room] = found;
  const attrs = room.data.attributes;
  if (attrs.photos.some((p) => p.toLowerCase() === fileId.toLowerCase())) return null;
  return roomChange(key, room, { ...attrs, photos: [...attrs.photos, fileId] });
}

// The change that writes a room's new attributes, at the current version (as rooms.ts roomAttributeChange).
function roomChange(key: string, room: RoomObject, next: RoomObject['data']['attributes']): Change {
  return {
    id: key,
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { ...room.data, attributes: next } as unknown as Record<string, unknown>,
    },
  };
}
