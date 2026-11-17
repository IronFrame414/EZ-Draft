// EZD-218 (S03 Controls — left panel "Tab: Rooms", "Room row"; 03 Q-0664 "Rooms gain …"; AC-EZD-218-4): the rooms of
// the open floor as the left panel lists them, and one room field edit as one model change. No React.
import {
  CEILING_TYPES,
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  ROOM_TYPES,
  roomAreaSqFt,
  type CeilingType,
  type ObjectStatus,
  type RoomObject,
  type RoomType,
} from '@ezdraft/geometry';
import type { Change, Objects } from '../model/patches';

export type RoomRow = {
  id: string;
  name: string;
  status: ObjectStatus;
  areaSqFt: number;
  roomType: RoomType | null;
  floorFinish: string;
  ceilingType: CeilingType | null;
};

export type RoomField = 'name' | 'roomType' | 'floorFinish' | 'ceilingType';

function parsedRoom(id: string, objects: Objects): RoomObject | null {
  const v = objects.get(id);
  if (v === undefined || v.type !== 'room') return null;
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  return r.ok && r.object.type === 'room' ? r.object : null;
}

// The open floor's rooms in stored order, each with its area in whole square feet (halves up).
export function roomRows(
  objects: Objects,
  floorId: string | null,
  area: (room: RoomObject) => number = (room) => roomAreaSqFt(room.data.geometry.boundary),
): RoomRow[] {
  if (floorId === null) return [];
  const floor = floorId.toLowerCase();
  const out: RoomRow[] = [];
  for (const id of objects.keys()) {
    const room = parsedRoom(id, objects);
    if (room === null || room.data.level.toLowerCase() !== floor) continue;
    const a = room.data.attributes;
    out.push({
      id: room.id,
      name: a.name,
      status: room.data.status,
      areaSqFt: area(room),
      roomType: a.roomType,
      floorFinish: a.floorFinish,
      ceilingType: a.ceilingType,
    });
  }
  return out;
}

const isRoomType = (v: unknown): v is RoomType =>
  v === null || (ROOM_TYPES as readonly unknown[]).includes(v);
const isCeilingType = (v: unknown): v is CeilingType =>
  v === null || (CEILING_TYPES as readonly unknown[]).includes(v);

// The one change that sets a room field, or null when it is refused (an unknown room, a blank name, a value not in
// its list) or changes nothing. Name and floor finish are trimmed.
export function roomAttributeChange(
  objects: Objects,
  id: string,
  field: RoomField,
  value: string | null,
): Change | null {
  const key = [...objects.keys()].find((k) => k.toLowerCase() === id.toLowerCase());
  if (key === undefined) return null;
  const room = parsedRoom(key, objects);
  if (room === null) return null;
  const attrs = room.data.attributes;
  let next: RoomObject['data']['attributes'];
  if (field === 'name') {
    const name = typeof value === 'string' ? value.trim() : '';
    if (name === '') return null;
    next = { ...attrs, name };
  } else if (field === 'floorFinish') {
    next = { ...attrs, floorFinish: typeof value === 'string' ? value.trim() : '' };
  } else if (field === 'roomType') {
    if (!isRoomType(value)) return null;
    next = { ...attrs, roomType: value };
  } else if (field === 'ceilingType') {
    if (!isCeilingType(value)) return null;
    next = { ...attrs, ceilingType: value };
  } else {
    return null;
  }
  if (next[field] === attrs[field]) return null;
  return {
    id: key,
    // Written from the parsed object at the current version, so an older stored room is saved upgraded.
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { ...room.data, attributes: next } as unknown as Record<string, unknown>,
    },
  };
}
