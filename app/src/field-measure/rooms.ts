// EZD-1415 (S17b Field measure; Data shown "rooms, shape, wall letters and lengths, ceiling height"): the rooms of
// one project's field measure session, as stored in field_measure_session.rooms and sent by the screen. The
// Building is always the first room ("Room chips: Building edits the outside outline"). Wall lengths are kept per
// wall in inches (null until typed; the keypad is EZD-1416). Shared by the screen and the server.
import * as z from 'zod/mini';
import { MAX_FIELD_LENGTH_IN } from './entry';
import { CANVAS_H, CANVAS_W, SHAPE_KINDS, wallCount, type Pt, type ShapeKind } from './shapes';

export const MAX_ROOMS = 40;
export const MAX_FREE_CORNERS = 60;
export const MAX_ROOM_NAME = 40;

const point = z.object({
  x: z.number().check(z.gte(0), z.lte(CANVAS_W)),
  y: z.number().check(z.gte(0), z.lte(CANVAS_H)),
});

// 0 to MAX_FIELD_LENGTH_IN inches. EZD-1419: a length over 200 ft (2400") is kept once confirmed (S17b Validation;
// entry.ts), up to 1000 ft.
const inches = z.nullable(z.number().check(z.gte(0), z.lte(MAX_FIELD_LENGTH_IN)));

export const roomSchema = z
  .strictObject({
    id: z.string().check(z.regex(/^[A-Za-z0-9_-]{1,40}$/)),
    kind: z.enum(['building', 'room']),
    name: z.string().check(z.trim(), z.minLength(1), z.maxLength(MAX_ROOM_NAME)),
    shape: z.nullable(z.enum(SHAPE_KINDS as [ShapeKind, ...ShapeKind[]])),
    corners: z.array(point).check(z.maxLength(MAX_FREE_CORNERS)),
    closed: z.boolean(),
    lengths: z.array(inches).check(z.maxLength(MAX_FREE_CORNERS)),
    ceiling: inches,
  })
  .check(
    z.refine((r) => r.lengths.length === wallCount(r.shape, r.corners, r.closed), {
      message: 'one length per wall',
    }),
    z.refine(
      (r) => r.shape === 'walls' || (r.corners.length === 0 && r.closed === (r.shape !== null)),
      {
        message: 'corners only in Walls mode',
      },
    ),
  );

export const roomsSchema = z.array(roomSchema).check(
  z.minLength(1),
  z.maxLength(MAX_ROOMS),
  z.refine((rs) => rs[0]?.kind === 'building' && rs.slice(1).every((r) => r.kind === 'room'), {
    message: 'the Building comes first, once',
  }),
  z.refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, {
    message: 'room ids are unique',
  }),
);

export type FieldRoom = z.infer<typeof roomSchema>;

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
