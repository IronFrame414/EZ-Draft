// EZD-202 Build step 6 (vault/plans/EZD-202.md section 3 `roomDataSchema`): the stored room.
// EZD-205a Build step 1 (vault/plans/EZD-205a.md section 3 `roomDataSchema`, Decided "Room data shape",
// "closureOverride"; Q-0568; Q-0570): a room holds its status and its closure override; `gap` is the miss vector in
// inches from the chain's last wall end to its first wall start.
// EZD-234 Build (Q-0704 03-data-model row 1 "Room gains floorLevel (signed inches, default 0) and photos
// (source_file ids)"; 03b rule 5): schema version 5 adds both to the room's attributes.
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const closureOverrideSchema = z.strictObject({
  who: z.uuid(),
  when: z.iso.datetime(),
  gap: pointSchema,
});
export type ClosureOverride = z.infer<typeof closureOverrideSchema>;

export const roomDataSchema = z.strictObject({
  geometry: z.strictObject({ boundary: z.array(pointSchema).min(3) }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    name: z.string().min(1),
    floorLevel: z.number().finite(),
    photos: z.array(z.uuid()),
  }),
  closureOverride: closureOverrideSchema.nullable(),
});
export type RoomData = z.infer<typeof roomDataSchema>;

// EZD-234 Build: every room maker builds its attributes here, so a new room field reaches every maker.
export function newRoomAttributes(name: string): RoomData['attributes'] {
  return { name, floorLevel: 0, photos: [] };
}
