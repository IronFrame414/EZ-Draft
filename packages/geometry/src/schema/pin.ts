// EZD-234 Build (Q-0704 03-data-model row 1 "pin"; 03f Existing-condition pins; W3): a marker on the existing plan
// that may hold one photo (a source_file id, checked on save). Its status is always existing.
import { z } from 'zod';
import { levelSchema, pointSchema } from './common';

export const PIN_KINDS = [
  'damage_moisture',
  'protect',
  'lead',
  'plumbing',
  'gas',
  'water_heater',
] as const;
export type PinKind = (typeof PIN_KINDS)[number];

export const pinDataSchema = z.strictObject({
  geometry: z.strictObject({ point: pointSchema }),
  status: z.literal('existing'),
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(PIN_KINDS),
    photoFileId: z.uuid().nullable(),
  }),
});
export type PinData = z.infer<typeof pinDataSchema>;
