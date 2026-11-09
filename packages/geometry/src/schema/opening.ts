// EZD-202 Build step 5 (vault/plans/EZD-202.md section 3 `openingDataSchema`, Decided "Opening position"): an
// absolute `center`; `hostWallId` is null for an opening off a wall.
// EZD-294 Build step 2 (vault/plans/EZD-294.md Decided "Where the number lives", "Valid number"; Q-0625 (a)):
// `number` is the opening's fixed number in its project, per kind.
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const openingDataSchema = z.strictObject({
  geometry: z.strictObject({ center: pointSchema, hostWallId: z.uuid().nullable() }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(['door', 'window']),
    width: z.number().positive(),
    height: z.number().positive(),
    roughOpening: z.strictObject({ width: z.number().positive(), height: z.number().positive() }),
    sillHeight: z.number().min(0),
    number: z.int().min(1).optional(),
  }),
});
export type OpeningData = z.infer<typeof openingDataSchema>;
