// EZD-514 (S05 Controls "Framing known | Inspector, when a ceiling is selected | Choose Unknown / New construction / Full
// demo / Enter locations. Enter locations: draw joist or beam lines with direction and spacing. | Edit model."; S05
// Decision 5; vault/build/assumptions.md EZD-514): the room's framing edits. Each is one change (one undo step),
// checked against the room schema.
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  roomFraming,
  type FramingKnown,
  type FramingLine,
  type RoomFraming,
} from '@ezdraft/geometry';
import { findRoom } from '../ceiling/room-ceiling';
import type { Change, Objects } from '../model/patches';

/** The room's framing (absent reads as Unknown with no lines), or null when the room is gone. */
export function framingOf(objects: Objects, roomId: string): RoomFraming | null {
  const room = findRoom(objects, roomId);
  return room === null ? null : roomFraming(room.data.attributes);
}

function storeFraming(objects: Objects, roomId: string, framing: RoomFraming): Change | null {
  const room = findRoom(objects, roomId);
  if (room === null) return null;
  const data = { ...room.data, attributes: { ...room.data.attributes, framing } };
  const r = parseStoredObject({
    id: room.id,
    type: 'room',
    schema_version: CURRENT_SCHEMA_VERSION,
    data,
  });
  if (!r.ok) return null;
  return {
    id: room.id,
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: r.object.data as unknown as Record<string, unknown>,
    },
  };
}

/** The Framing known choice; the drawn lines stay so a choice back keeps them. Null when unchanged or refused. */
export function setFramingKnown(
  objects: Objects,
  roomId: string,
  known: FramingKnown,
): Change | null {
  const now = framingOf(objects, roomId);
  if (now === null || now.known === known) return null;
  return storeFraming(objects, roomId, { ...now, known });
}

/** One drawn line added to the room's framing; null when the room is gone or the line is refused. */
export function addFramingLine(objects: Objects, roomId: string, line: FramingLine): Change | null {
  const now = framingOf(objects, roomId);
  if (now === null) return null;
  return storeFraming(objects, roomId, { ...now, lines: [...now.lines, line] });
}

/** Line `index` removed; null when there is no such line. */
export function removeFramingLine(objects: Objects, roomId: string, index: number): Change | null {
  const now = framingOf(objects, roomId);
  if (now === null || now.lines[index] === undefined) return null;
  return storeFraming(objects, roomId, { ...now, lines: now.lines.filter((_, i) => i !== index) });
}
