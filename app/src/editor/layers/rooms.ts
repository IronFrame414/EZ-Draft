// EZD-218 (S03 Controls — left panel "Tab: Rooms", "Room row"; 03 Q-0664 "Rooms gain …"; AC-EZD-218-4): the rooms of
// the open floor as the left panel lists them, and one room field edit as one model change. No React.
import {
  CEILING_TYPES,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_TILE_HEIGHT,
  DEFAULT_TILE_JOINT,
  DEFAULT_TILE_WIDTH,
  floorTileLayout,
  parseStoredObject,
  ROOM_TYPES,
  roomAreaSqFt,
  TILE_PATTERNS,
  type CeilingType,
  type ModelObject,
  type ObjectStatus,
  type TilePattern,
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

// EZD-733 (phase-07 EZD-733 "Tile pattern, start point and visible cuts on the plan"; S19 "Tile pattern select";
// Q-0769 no board; vault/build/assumptions.md EZD-733): a room's floor tile as the Rooms tab shows it, and its edits.
// The start point is shown and typed from the room's left and bottom edges (its outline's box on the plan). Each edit
// is one model change.
export type FloorTileRow = {
  id: string;
  pattern: TilePattern;
  tileWidth: number;
  tileHeight: number;
  joint: number;
  fromLeft: number;
  fromBottom: number;
};

export type FloorTileEdit = Partial<Omit<FloorTileRow, 'id'>>;

function parsedAll(objects: Objects): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
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

const corner = (room: RoomObject) => ({
  x: Math.min(...room.data.geometry.boundary.map((p) => p.x)),
  y: Math.min(...room.data.geometry.boundary.map((p) => p.y)),
});

const roomKey = (objects: Objects, id: string) =>
  [...objects.keys()].find((k) => k.toLowerCase() === id.toLowerCase());

const tileChange = (o: ModelObject): Change => ({
  id: o.id,
  value: {
    type: o.type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: o.data as unknown as Record<string, unknown>,
  },
});

export function floorTileRow(objects: Objects, roomId: string): FloorTileRow | null {
  const key = roomKey(objects, roomId);
  const room = key === undefined ? null : parsedRoom(key, objects);
  if (room === null) return null;
  const t = floorTileLayout(parsedAll(objects), room.id);
  if (t === null) return null;
  const c = corner(room);
  return {
    id: t.id,
    ...t.data.attributes,
    fromLeft: t.data.geometry.start.x - c.x,
    fromBottom: t.data.geometry.start.y - c.y,
  };
}

// A new floor tile from the room's lower left corner: the defaults of schema/tile-layout.ts. Null when the room is
// unknown or already has one.
export function floorTileAddChange(
  objects: Objects,
  roomId: string,
  newId: () => string,
): Change | null {
  const key = roomKey(objects, roomId);
  const room = key === undefined ? null : parsedRoom(key, objects);
  if (room === null || floorTileRow(objects, room.id) !== null) return null;
  return tileChange({
    id: newId(),
    type: 'tile_layout',
    data: {
      geometry: { host: { kind: 'floor', roomId: room.id }, start: corner(room) },
      status: 'new',
      level: room.data.level,
      attributes: {
        pattern: 'straight',
        tileWidth: DEFAULT_TILE_WIDTH,
        tileHeight: DEFAULT_TILE_HEIGHT,
        joint: DEFAULT_TILE_JOINT,
      },
    },
  });
}

// One edit of the room's floor tile, or null when refused (a size at or below 0, a negative joint, an unknown
// pattern) or when nothing changes.
export function floorTileChange(objects: Objects, roomId: string, e: FloorTileEdit): Change | null {
  const key = roomKey(objects, roomId);
  const room = key === undefined ? null : parsedRoom(key, objects);
  if (room === null) return null;
  const t = floorTileLayout(parsedAll(objects), room.id);
  if (t === null) return null;
  if (e.tileWidth !== undefined && !(e.tileWidth > 0)) return null;
  if (e.tileHeight !== undefined && !(e.tileHeight > 0)) return null;
  if (e.joint !== undefined && !(e.joint >= 0)) return null;
  if (e.pattern !== undefined && !(TILE_PATTERNS as readonly string[]).includes(e.pattern))
    return null;
  const c = corner(room);
  const a = t.data.attributes;
  const s = t.data.geometry.start;
  const next = {
    ...t,
    data: {
      ...t.data,
      geometry: {
        ...t.data.geometry,
        start: {
          x: e.fromLeft === undefined ? s.x : c.x + e.fromLeft,
          y: e.fromBottom === undefined ? s.y : c.y + e.fromBottom,
        },
      },
      attributes: {
        pattern: e.pattern ?? a.pattern,
        tileWidth: e.tileWidth ?? a.tileWidth,
        tileHeight: e.tileHeight ?? a.tileHeight,
        joint: e.joint ?? a.joint,
      },
    },
  };
  if (JSON.stringify(next.data) === JSON.stringify(t.data)) return null;
  return tileChange(next);
}
