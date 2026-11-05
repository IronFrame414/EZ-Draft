// EZD-202 Build step 4 (vault/plans/EZD-202.md section 3 `wallDataSchema`, Decided "Wall line"; Q-0575):
// `start` to `end` is the inside finished face; `thicknessSide` is where the thickness lies walking start to end.
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const THICKNESS_SIDES = ['left', 'right', 'center'] as const;

export const wallDataSchema = z.strictObject({
  geometry: z.strictObject({ start: pointSchema, end: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    thickness: z.number().positive(),
    thicknessSide: z.enum(THICKNESS_SIDES),
    height: z.number().positive(),
    topCutToCeiling: z.boolean(),
    bearing: z.boolean(),
  }),
});
export type WallData = z.infer<typeof wallDataSchema>;
