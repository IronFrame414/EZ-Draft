// EZD-5604a Build step 1 (vault/plans/EZD-5604a.md Decided "D-Schema"; Q-0637 change format row; Q-0638 gap 15;
// Q-0640 row 7; Q-0642 row 4; AC-EZD-5604-1, -2, -6, -8): one change of an Assistant reply. An add, update or
// remove of a wall, door or window, named by a short ref. Strict: no status, number, rough opening mode, id, top
// cut, side or host on an update. Values are checked by the hand-drawing setters, not here. Browser and server.
import {
  DOOR_HANDS,
  DOOR_SWINGS,
  IMPACT_RATINGS,
  SHUTTER_TYPES,
  THICKNESS_SIDES,
  WALL_MATERIALS,
} from '@ezdraft/geometry';
import { z } from 'zod';

export const ASSISTANT_REF_PATTERN = /^[a-z][a-z0-9]{0,15}$/;

const ref = z.string().regex(ASSISTANT_REF_PATTERN);
const point = z.strictObject({ x: z.number(), y: z.number() });
const layer = z.strictObject({ material: z.enum(WALL_MATERIALS), thickness: z.number() });
const size = z.strictObject({ width: z.number(), height: z.number() });
const openingType = z.enum(['door', 'window']);

const wallFields = {
  thickness: z.number().optional(),
  height: z.number().optional(),
  bearing: z.boolean().optional(),
  layers: z.array(layer).optional(),
};

const openingFields = {
  width: z.number().optional(),
  height: z.number().optional(),
  roughOpening: size.optional(),
  sillHeight: z.number().optional(),
  swing: z.enum(DOOR_SWINGS).optional(),
  hand: z.enum(DOOR_HANDS).optional(),
  impactRating: z.enum(IMPACT_RATINGS).optional(),
  shutterType: z.enum(SHUTTER_TYPES).optional(),
};

const notBoth = (c: { thickness?: number; layers?: unknown }) =>
  c.thickness === undefined || c.layers === undefined;

// An update names at least one field besides op, type and ref.
const namesAField = (c: Record<string, unknown>) =>
  Object.keys(c).some((k) => k !== 'op' && k !== 'type' && k !== 'ref');

const wallAdd = z
  .strictObject({
    op: z.literal('add'),
    type: z.literal('wall'),
    ref,
    floor: ref.optional(),
    start: point,
    end: point,
    thicknessSide: z.enum(THICKNESS_SIDES).optional(),
    ...wallFields,
  })
  .refine(notBoth);

const openingAdd = z.strictObject({
  op: z.literal('add'),
  type: openingType,
  ref,
  floor: ref.optional(),
  hostWall: ref,
  center: point,
  ...openingFields,
});

const wallUpdate = z
  .strictObject({
    op: z.literal('update'),
    type: z.literal('wall'),
    ref,
    start: point.optional(),
    end: point.optional(),
    ...wallFields,
  })
  .refine(notBoth)
  .refine(namesAField);

const openingUpdate = z
  .strictObject({
    op: z.literal('update'),
    type: openingType,
    ref,
    center: point.optional(),
    ...openingFields,
  })
  .refine(namesAField);

const remove = z.strictObject({
  op: z.literal('remove'),
  type: z.enum(['wall', 'door', 'window']),
  ref,
});

export const assistantChangeSchema = z.union([
  wallAdd,
  openingAdd,
  wallUpdate,
  openingUpdate,
  remove,
]);

export type AssistantChange = z.infer<typeof assistantChangeSchema>;
