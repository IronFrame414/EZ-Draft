// EZD-1998 (AC-EZD-1998-2; audit F7): the rooms of one project's field measure session without zod, so the phone
// screen's first load does not carry it. The type, limits and room helpers moved here unchanged from rooms.ts
// (EZD-1415, EZD-1419), which keeps the zod schemas for the server and re-exports all of this; room-check.ts is the
// screen's hand-written check of the phone's saved copy with the same rules. rooms.ts proves at compile time that
// FieldRoom equals the schema's type.
import { wallCount, type Pt, type ShapeKind } from './shapes';

export const MAX_ROOMS = 40;
export const MAX_FREE_CORNERS = 60;
export const MAX_ROOM_NAME = 40;

/** One room as stored in field_measure_session.rooms (rooms.ts roomSchema). */
export type FieldRoom = {
  id: string;
  kind: 'building' | 'room';
  name: string;
  shape: ShapeKind | null;
  corners: Pt[];
  closed: boolean;
  lengths: (number | null)[];
  ceiling: number | null;
};

export const BUILDING_ID = 'building';

/**
 * A new session: the Building alone, no shape yet (S17b States "empty room (pick a shape)"). The stored name is
 * fixed; the chip shows the Building label in the user's language.
 */
export function initialRooms(): FieldRoom[] {
  return [emptyRoom(BUILDING_ID, 'building', 'Building')];
}

export function emptyRoom(id: string, kind: FieldRoom['kind'], name: string): FieldRoom {
  return { id, kind, name, shape: null, corners: [], closed: false, lengths: [], ceiling: null };
}

/**
 * The room with a new shape. A template is closed at once with one length per wall; Walls starts with no corners.
 * EZD-1419 (S17b Shape picker "Changing shape after measuring asks to confirm and keeps matching walls"): a template
 * keeps the length of each wall whose letter it still has (A with A, B with B, ...), the others are empty; Walls
 * starts a new outline, so it keeps none (vault/build/assumptions.md EZD-1419). The ceiling is kept.
 */
export function withShape(room: FieldRoom, shape: ShapeKind): FieldRoom {
  if (shape === 'walls') return { ...room, shape, corners: [], closed: false, lengths: [] };
  const count = wallCount(shape, [], true);
  const lengths = Array.from({ length: count }, (_, i) => room.lengths[i] ?? null);
  return { ...room, shape, corners: [], closed: true, lengths };
}

/** EZD-1419: true once any wall of the room has a length (a shape change then asks to confirm). */
export function isMeasured(room: FieldRoom): boolean {
  return room.lengths.some((l) => l !== null);
}

/** The room after a free outline change: lengths kept for walls that still exist, new walls empty. */
export function withOutline(room: FieldRoom, corners: Pt[], closed: boolean): FieldRoom {
  const count = wallCount('walls', corners, closed);
  const lengths = Array.from({ length: count }, (_, i) => room.lengths[i] ?? null);
  return { ...room, corners, closed, lengths };
}

/** A unique name: the picked or typed name, then "Name 2", "Name 3" when it is taken. */
export function uniqueName(rooms: readonly FieldRoom[], name: string): string {
  const taken = new Set(rooms.map((r) => r.name.toLowerCase()));
  const whole = name.trim().slice(0, MAX_ROOM_NAME);
  if (!taken.has(whole.toLowerCase())) return whole;
  const base = whole.slice(0, MAX_ROOM_NAME - 3);
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
