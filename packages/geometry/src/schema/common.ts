// EZD-202 Build step 2 (vault/plans/EZD-202.md section 3 `common.ts`; 03f Objects inside model_json): the parts
// every object schema shares. Lengths and coordinates are decimal inches and are never rounded (03g).
import { z } from 'zod';

export const pointSchema = z.strictObject({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof pointSchema>;

export const OBJECT_STATUSES = ['existing', 'demo', 'new'] as const;
export const objectStatusSchema = z.enum(OBJECT_STATUSES);
export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

export const levelSchema = z.uuid();

// EZD-234 Build (Q-0704 03-data-model "fixture: ... axis (unit vector, as opening.ts:35)"): a direction stored as a
// unit vector, within the opening axis tolerance.
export const UNIT_VECTOR_TOLERANCE = 1e-9;
export const unitVectorSchema = pointSchema.refine(
  (p) => Math.abs(Math.hypot(p.x, p.y) - 1) <= UNIT_VECTOR_TOLERANCE,
);

// EZD-234 Build (Q-0704): a closed outline, at least three corners, the first corner not repeated at the end.
export const polygonSchema = z.array(pointSchema).min(3);
