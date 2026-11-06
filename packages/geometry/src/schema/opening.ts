// EZD-202 Build step 5 (vault/plans/EZD-202.md section 3 `openingDataSchema`, Decided "Opening position"): an
// absolute `center`; `hostWallId` is null for an opening off a wall.
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
  }),
});
export type OpeningData = z.infer<typeof openingDataSchema>;
