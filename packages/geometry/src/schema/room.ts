// EZD-202 Build step 6 (vault/plans/EZD-202.md section 3 `roomDataSchema`): the stored room.
// EZD-205a Build step 1 (vault/plans/EZD-205a.md section 3 `roomDataSchema`, Decided "Room data shape",
// "closureOverride"; Q-0568; Q-0570): a room holds its status and its closure override; `gap` is the miss vector in
// inches from the chain's last wall end to its first wall start.
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
  attributes: z.strictObject({ name: z.string().min(1) }),
  closureOverride: closureOverrideSchema.nullable(),
});
export type RoomData = z.infer<typeof roomDataSchema>;
