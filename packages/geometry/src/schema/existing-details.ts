// EZD-234 Build (Q-0704 03-data-model row 2; 03f Existing-condition pins Rounds 1-2; phase-02.md EZD-229): the
// existing-detail types under the names later phases extend, so those phases only add enum values.
// - hvac: supply or return register (EZD-512 adds exhaust fan), a rectangle like a fixture.
// - device: the electrical device type (EZD-507, 03f:13); phase 10 has the detectors only (R3-126).
// - access: attic hatch (EZD-507 adds access panel), a rectangle like a fixture.
// - soffit: a polygon; `dropHeight` is measured down from the room's ceiling height.
// - chase: a polygon.
import { z } from 'zod';
import {
  levelSchema,
  objectStatusSchema,
  pointSchema,
  polygonSchema,
  unitVectorSchema,
} from './common';

const rectGeometry = z.strictObject({ center: pointSchema, axis: unitVectorSchema });

export const HVAC_KINDS = ['supply', 'return'] as const;
export const hvacDataSchema = z.strictObject({
  geometry: rectGeometry,
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(HVAC_KINDS),
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
});
export type HvacData = z.infer<typeof hvacDataSchema>;

export const DEVICE_KINDS = ['smoke_detector', 'co_detector', 'smoke_co_detector'] as const;
export const deviceDataSchema = z.strictObject({
  geometry: z.strictObject({ point: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({ kind: z.enum(DEVICE_KINDS) }),
});
export type DeviceData = z.infer<typeof deviceDataSchema>;

export const ACCESS_KINDS = ['attic_hatch'] as const;
export const accessDataSchema = z.strictObject({
  geometry: rectGeometry,
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(ACCESS_KINDS),
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
});
export type AccessData = z.infer<typeof accessDataSchema>;

export const soffitDataSchema = z.strictObject({
  geometry: z.strictObject({ boundary: polygonSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({ dropHeight: z.number().positive() }),
});
export type SoffitData = z.infer<typeof soffitDataSchema>;

export const chaseDataSchema = z.strictObject({
  geometry: z.strictObject({ boundary: polygonSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({}),
});
export type ChaseData = z.infer<typeof chaseDataSchema>;
