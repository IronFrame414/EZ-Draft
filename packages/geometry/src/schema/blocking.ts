// EZD-234 Build (Q-0704 03-data-model row 2 "blocking"; 09-calculations Q-0704 "Grab-bar blocking height and
// length are required and positive and have no default"): wall-hosted framing for a future grab bar. Its geometry is
// the opening geometry exactly, with the same hosted-axis refine; `heightToCenter` is from the finished floor of the
// room on `side` (left or right walking the wall start to end).
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema, UNIT_VECTOR_TOLERANCE } from './common';

export const blockingDataSchema = z
  .strictObject({
    geometry: z.strictObject({
      center: pointSchema,
      hostWallId: z.uuid().nullable(),
      axis: pointSchema.nullable(),
    }),
    status: objectStatusSchema,
    level: levelSchema,
    attributes: z.strictObject({
      length: z.number().positive(),
      heightToCenter: z.number().positive(),
      side: z.enum(['left', 'right']),
    }),
  })
  .refine((d) => {
    const g = d.geometry;
    const hostedAxis = g.hostWallId === null || g.axis === null;
    const unitAxis =
      g.axis === null || Math.abs(Math.hypot(g.axis.x, g.axis.y) - 1) <= UNIT_VECTOR_TOLERANCE;
    return hostedAxis && unitAxis;
  });
export type BlockingData = z.infer<typeof blockingDataSchema>;
