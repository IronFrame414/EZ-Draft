// EZD-1415 (S17b Field measure; Data shown "rooms, shape, wall letters and lengths, ceiling height"): the rooms of
// one project's field measure session, as stored in field_measure_session.rooms and sent by the screen. The
// Building is always the first room ("Room chips: Building edits the outside outline"). Wall lengths are kept per
// wall in inches (null until typed; the keypad is EZD-1416). Shared by the screen and the server.
// EZD-1998 (AC-EZD-1998-2): the type, limits and helpers live in room-model.ts (no zod) and are re-exported here;
// the client checks the phone's saved copy with room-check.ts, so only the server loads these schemas.
import * as z from 'zod/mini';
import { MAX_FIELD_LENGTH_IN } from './entry';
import { MAX_FREE_CORNERS, MAX_ROOMS, MAX_ROOM_NAME, type FieldRoom } from './room-model';
import { CANVAS_H, CANVAS_W, SHAPE_KINDS, wallCount, type ShapeKind } from './shapes';

export * from './room-model';

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

// EZD-1998: the hand-written FieldRoom (room-model.ts) is exactly the schema's type; either drifting fails typecheck.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameRoom: Same<FieldRoom, z.infer<typeof roomSchema>> = true;
void sameRoom;
