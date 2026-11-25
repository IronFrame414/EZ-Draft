// EZD-513 (S05 Controls "Soffit, tray, coffer | Ceiling rail | Draws a soffit, tray, coffer or crown; edges get
// dimensions.", "Height and material tag | Ceiling rail | Click an area to place a tag (e.g. "CLG 8' 0" · ACT 2x2").
// Tag reads from the ceiling data. | Edit model. Tag text is generated, not free text."; S05 Data shown "soffits,
// trays, coffers, crown", "Height/material tags per area"; Q-0704 03-data-model row 2 "soffit dropHeight is measured
// down from the room's ceiling height, which EZD-513's tag reads"; AC-EZD-513-1, -2; vault/build/assumptions.md
// EZD-513).
// - A soffit is the existing `soffit` type (existing-details.ts), drawn on the ceiling as a closed outline.
// - `ceiling_shape`: a tray, a coffer or a crown run, a closed outline drawn by clicks on one room's ceiling.
//   `depth` is in inches: a tray's rise above the room's ceiling height and a coffer's recess above it (measured up,
//   as a soffit's drop is measured down), and a crown's size (its height on the wall).
// - `ceiling_tag`: a height and material tag at a point (`point`, so it picks as a utility point does). Its text is never stored; it is worked out from the ceiling
//   data under the point each time it is drawn.
// New types, so the schema version stays.
import * as z from 'zod/mini';
import { levelSchema, objectStatusSchema, pointSchema, polygonSchema } from './common';

export const CEILING_SHAPE_KINDS = ['tray', 'coffer', 'crown'] as const;
export type CeilingShapeKind = (typeof CEILING_SHAPE_KINDS)[number];

export const ceilingShapeDataSchema = z.strictObject({
  geometry: z.strictObject({ roomId: z.uuid(), boundary: polygonSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(CEILING_SHAPE_KINDS),
    depth: z.number().check(z.positive()),
  }),
});
export type CeilingShapeData = z.infer<typeof ceilingShapeDataSchema>;

export const ceilingTagDataSchema = z.strictObject({
  geometry: z.strictObject({ point: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({}),
});
export type CeilingTagData = z.infer<typeof ceilingTagDataSchema>;
