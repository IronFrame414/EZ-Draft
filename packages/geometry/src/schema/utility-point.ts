// EZD-234 Build (Q-0704 03-data-model row 1 "utility_point"; 09-calculations Q-0704 "Electric utility points take
// 120 or 240 V (09b:35) and positive amps"; AC-EZD-234-3): where an appliance's line arrives. Volts and amps are set
// only for electric (refined as opening.ts); `servesObjectId` names one fixture or is null, and an id that names no
// live fixture reads as no appliance.
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const UTILITY_KINDS = ['electric', 'gas', 'water', 'drain'] as const;
export type UtilityKind = (typeof UTILITY_KINDS)[number];
export const UTILITY_VOLTS = [120, 240] as const;

export const utilityPointDataSchema = z
  .strictObject({
    geometry: z.strictObject({ point: pointSchema }),
    status: objectStatusSchema,
    level: levelSchema,
    attributes: z.strictObject({
      kind: z.enum(UTILITY_KINDS),
      volts: z.union([z.literal(120), z.literal(240)]).nullable(),
      amps: z.number().positive().nullable(),
      servesObjectId: z.uuid().nullable(),
    }),
  })
  .refine((d) => {
    const a = d.attributes;
    return a.kind === 'electric'
      ? a.volts !== null && a.amps !== null
      : a.volts === null && a.amps === null;
  });
export type UtilityPointData = z.infer<typeof utilityPointDataSchema>;
