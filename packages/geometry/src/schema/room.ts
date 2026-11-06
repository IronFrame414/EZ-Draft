// EZD-202 Build step 6 (vault/plans/EZD-202.md section 3 `roomDataSchema`): a room has no status (Q-0570).
import { z } from 'zod';
import { levelSchema, pointSchema } from './common';

export const roomDataSchema = z.strictObject({
  geometry: z.strictObject({ boundary: z.array(pointSchema).min(3) }),
  level: levelSchema,
  attributes: z.strictObject({ name: z.string().min(1) }),
});
export type RoomData = z.infer<typeof roomDataSchema>;
