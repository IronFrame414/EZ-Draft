// EZD-234 Build (Q-0704 03-data-model row 1 "fixture"; 03f Fixtures and appliances; S03 Fixtures; AC-EZD-234-2):
// a plumbing fixture or appliance placed from the Fixtures panel. `center` is the middle of its outline; `axis` is
// the unit direction its width runs along, and its depth runs to the left of `axis` (the front faces the other way).
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema, unitVectorSchema } from './common';

export const FIXTURE_KINDS = [
  'toilet',
  'lavatory',
  'tub',
  'shower_prefab',
  'sink',
  'cooktop',
  'range',
  'hood',
  'refrigerator',
  'dishwasher',
  'disposal',
  'washer',
  'dryer',
  'water_heater',
] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export const fixtureDataSchema = z.strictObject({
  geometry: z.strictObject({ center: pointSchema, axis: unitVectorSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(FIXTURE_KINDS),
    width: z.number().positive(),
    depth: z.number().positive(),
  }),
});
export type FixtureData = z.infer<typeof fixtureDataSchema>;
