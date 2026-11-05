// EZD-202 Build step 2 (vault/plans/EZD-202.md section 3 `common.ts`; 03f Objects inside model_json): the parts
// every object schema shares. Lengths and coordinates are decimal inches and are never rounded (03g).
import { z } from 'zod';

export const pointSchema = z.strictObject({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof pointSchema>;

export const OBJECT_STATUSES = ['existing', 'demo', 'new'] as const;
export const objectStatusSchema = z.enum(OBJECT_STATUSES);

export const levelSchema = z.uuid();
