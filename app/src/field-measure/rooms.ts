// EZD-1415 (S17b Field measure; Data shown "rooms, shape, wall letters and lengths, ceiling height"): the rooms of
// one project's field measure session, as stored in field_measure_session.rooms and sent by the screen. The
// Building is always the first room ("Room chips: Building edits the outside outline"). Wall lengths are kept per
// wall in inches (null until typed; the keypad is EZD-1416). Shared by the screen and the server.
import { z } from 'zod';
import { CANVAS_H, CANVAS_W, SHAPE_KINDS, wallCount, type Pt, type ShapeKind } from './shapes';

export const MAX_ROOMS = 40;
export const MAX_FREE_CORNERS = 60;
export const MAX_ROOM_NAME = 40;

const point = z.object({
  x: z.number().min(0).max(CANVAS_W),
  y: z.number().min(0).max(CANVAS_H),
});

// 0 to 2400 inches: the wall length limit (packages/geometry length.ts MAX_WALL_LENGTH_IN).
const inches = z.number().min(0).max(2400).nullable();

export const roomSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    kind: z.enum(['building', 'room']),
    name: z.string().trim().min(1).max(MAX_ROOM_NAME),
    shape: z.enum(SHAPE_KINDS as [ShapeKind, ...ShapeKind[]]).nullable(),
    corners: z.array(point).max(MAX_FREE_CORNERS),
    closed: z.boolean(),
    lengths: z.array(inches).max(MAX_FREE_CORNERS),
    ceiling: inches,
  })
  .strict()
  .refine((r) => r.lengths.length === wallCount(r.shape, r.corners, r.closed), {
    message: 'one length per wall',
  })
  .refine((r) => r.shape === 'walls' || (r.corners.length === 0 && r.closed === (r.shape !== null)), {
    message: 'corners only in Walls mode',
  });

export const roomsSchema = z
  .array(roomSchema)
  .min(1)
  .max(MAX_ROOMS)
  .refine((rs) => rs[0]?.kind === 'building' && rs.slice(1).every((r) => r.kind === 'room'), {
    message: 'the Building comes first, once',
  })
  .refine((rs) => new Set(rs.map((r) => r.id)).size === rs.length, { message: 'room ids are unique' });

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
 * The room with a new shape. A template is closed at once with one empty length per wall; Walls starts with no
 * corners. Asking to confirm a change after measuring is EZD-1419.
 */
export function withShape(room: FieldRoom, shape: ShapeKind): FieldRoom {
  if (shape === 'walls') return { ...room, shape, corners: [], closed: false, lengths: [] };
  const count = wallCount(shape, [], true);
  return { ...room, shape, corners: [], closed: true, lengths: Array<number | null>(count).fill(null) };
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
