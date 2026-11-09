// EZD-202 Build step 4 (vault/plans/EZD-202.md section 3 `wallDataSchema`, Decided "Wall line"; Q-0575):
// `start` to `end` is the inside finished face; `thicknessSide` is where the thickness lies walking start to end.
// EZD-203 Build step 4 (vault/plans/EZD-203.md section 3 `schema/wall.ts`): `layers` listed from the left face to
// the right face walking start to end; their thicknesses add up to `thickness` within 1/64".
// EZD-294 Build step 1 (vault/plans/EZD-294.md Decided "Where the number lives", "Valid number"; Q-0625 (a)):
// `number` is the wall's fixed number in its project, optional so stored v3 documents without it still parse.
import { z } from 'zod';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const THICKNESS_SIDES = ['left', 'right', 'center'] as const;

export const WALL_MATERIALS = ['stud', 'drywall', 'tile_backer'] as const;

export const wallLayerSchema = z.strictObject({
  material: z.enum(WALL_MATERIALS),
  thickness: z.number().positive(),
});
export type WallLayer = z.infer<typeof wallLayerSchema>;

export const wallDataSchema = z
  .strictObject({
    geometry: z.strictObject({ start: pointSchema, end: pointSchema }),
    status: objectStatusSchema,
    level: levelSchema,
    attributes: z.strictObject({
      thickness: z.number().positive(),
      thicknessSide: z.enum(THICKNESS_SIDES),
      height: z.number().positive(),
      topCutToCeiling: z.boolean(),
      bearing: z.boolean(),
      layers: z.array(wallLayerSchema).min(1),
      number: z.int().min(1).optional(),
    }),
  })
  .refine(
    (d) =>
      Math.abs(
        d.attributes.layers.reduce((sum, layer) => sum + layer.thickness, 0) -
          d.attributes.thickness,
      ) <= COMPARISON_TOLERANCE_IN,
  );
export type WallData = z.infer<typeof wallDataSchema>;
