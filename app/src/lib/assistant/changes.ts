// EZD-5604a Build step 1 (vault/plans/EZD-5604a.md Decided "D-Schema"; Q-0637 change format row; Q-0638 gap 15;
// Q-0640 row 7; Q-0642 row 4; AC-EZD-5604-1, -2, -6, -8): one change of an Assistant reply. An add, update or
// remove of a wall, door or window, named by a short ref. Strict: no status, number, rough opening mode, id, top
// cut, side or host on an update. Values are checked by the hand-drawing setters, not here. Browser and server.
// EZD-214 (05 Q-0664 "AI commands"; Q-0638; Q-0474): set_status {ref, status} sets one wall, door or window's
// status, previewed as an update; status stays refused on an update, and remove stays the Delete key.
import {
  DOOR_HANDS,
  DOOR_SWINGS,
  IMPACT_RATINGS,
  OBJECT_STATUSES,
  SHUTTER_TYPES,
  THICKNESS_SIDES,
  WALL_MATERIALS,
} from '@ezdraft/geometry';
import * as z from 'zod/mini';

export const ASSISTANT_REF_PATTERN = /^[a-z][a-z0-9]{0,15}$/;

const ref = z.string().check(z.regex(ASSISTANT_REF_PATTERN));
const point = z.strictObject({ x: z.number(), y: z.number() });
const layer = z.strictObject({ material: z.enum(WALL_MATERIALS), thickness: z.number() });
const size = z.strictObject({ width: z.number(), height: z.number() });
const openingType = z.enum(['door', 'window']);

const wallFields = {
  thickness: z.optional(z.number()),
  height: z.optional(z.number()),
  bearing: z.optional(z.boolean()),
  layers: z.optional(z.array(layer)),
};

const openingFields = {
  width: z.optional(z.number()),
  height: z.optional(z.number()),
  roughOpening: z.optional(size),
  sillHeight: z.optional(z.number()),
  swing: z.optional(z.enum(DOOR_SWINGS)),
  hand: z.optional(z.enum(DOOR_HANDS)),
  impactRating: z.optional(z.enum(IMPACT_RATINGS)),
  shutterType: z.optional(z.enum(SHUTTER_TYPES)),
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
    floor: z.optional(ref),
    start: point,
    end: point,
    thicknessSide: z.optional(z.enum(THICKNESS_SIDES)),
    ...wallFields,
  })
  .check(z.refine(notBoth));

const openingAdd = z.strictObject({
  op: z.literal('add'),
  type: openingType,
  ref,
  floor: z.optional(ref),
  hostWall: ref,
  center: point,
  ...openingFields,
});

const wallUpdate = z
  .strictObject({
    op: z.literal('update'),
    type: z.literal('wall'),
    ref,
    start: z.optional(point),
    end: z.optional(point),
    ...wallFields,
  })
  .check(z.refine(notBoth), z.refine(namesAField));

const openingUpdate = z
  .strictObject({
    op: z.literal('update'),
    type: openingType,
    ref,
    center: z.optional(point),
    ...openingFields,
  })
  .check(z.refine(namesAField));

const remove = z.strictObject({
  op: z.literal('remove'),
  type: z.enum(['wall', 'door', 'window']),
  ref,
});

const setStatus = z.strictObject({
  op: z.literal('set_status'),
  ref,
  status: z.enum(OBJECT_STATUSES),
});

export const assistantChangeSchema = z.union([
  wallAdd,
  openingAdd,
  wallUpdate,
  openingUpdate,
  remove,
  setStatus,
]);

export type AssistantChange = z.infer<typeof assistantChangeSchema>;
