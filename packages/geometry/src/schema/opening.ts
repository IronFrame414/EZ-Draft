// EZD-202 Build step 5 (vault/plans/EZD-202.md section 3 `openingDataSchema`, Decided "Opening position"): an
// absolute `center`; `hostWallId` is null for an opening off a wall.
// EZD-294 Build step 2 (vault/plans/EZD-294.md Decided "Where the number lives", "Valid number"; Q-0625 (a)):
// `number` is the opening's fixed number in its project, per kind.
// EZD-204a Build step 1 (vault/plans/EZD-204a.md section 1, Decided "Opening v4"; Q-0630 rows 4, 14, 38; Q-0633
// G11; Q-0640 rows 2, 7; Q-0508): version 4 adds `axis`, `swing`, `hand`, `impactRating`, `shutterType` and
// `roughOpeningMode`, with one refine over doors, shutters and the flagged axis.
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const DOOR_SWINGS = ['left', 'right'] as const;
export const DOOR_HANDS = ['left', 'right'] as const;
export const IMPACT_RATINGS = ['not_rated', 'impact_rated', 'shutter'] as const;
export const SHUTTER_TYPES = [
  'accordion',
  'roll_down',
  'storm_panel',
  'colonial',
  'bahama',
] as const;
export const ROUGH_OPENING_MODES = ['auto', 'typed'] as const;
export const AXIS_UNIT_TOLERANCE = 1e-9;

export type DoorSwing = (typeof DOOR_SWINGS)[number];
export type DoorHand = (typeof DOOR_HANDS)[number];
export type ImpactRating = (typeof IMPACT_RATINGS)[number];
export type ShutterType = (typeof SHUTTER_TYPES)[number];
export type RoughOpeningMode = (typeof ROUGH_OPENING_MODES)[number];

export const openingDataShape = z.strictObject({
  geometry: z.strictObject({
    center: pointSchema,
    hostWallId: z.uuid().nullable(),
    axis: pointSchema.nullable(),
  }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(['door', 'window']),
    width: z.number().positive(),
    height: z.number().positive(),
    roughOpening: z.strictObject({ width: z.number().positive(), height: z.number().positive() }),
    sillHeight: z.number().min(0),
    number: z.int().min(1).optional(),
    swing: z.enum(DOOR_SWINGS).nullable(),
    hand: z.enum(DOOR_HANDS).nullable(),
    impactRating: z.enum(IMPACT_RATINGS),
    shutterType: z.enum(SHUTTER_TYPES).nullable(),
    roughOpeningMode: z.enum(ROUGH_OPENING_MODES),
  }),
});

export const openingDataSchema = openingDataShape.refine((d) => {
  const a = d.attributes;
  const g = d.geometry;
  const doorFields =
    a.kind === 'door' ? a.swing !== null && a.hand !== null : a.swing === null && a.hand === null;
  const shutter = a.shutterType === null || a.impactRating === 'shutter';
  const hostedAxis = g.hostWallId === null || g.axis === null;
  const unitAxis =
    g.axis === null || Math.abs(Math.hypot(g.axis.x, g.axis.y) - 1) <= AXIS_UNIT_TOLERANCE;
  return doorFields && shutter && hostedAxis && unitAxis;
});
export type OpeningData = z.infer<typeof openingDataSchema>;
