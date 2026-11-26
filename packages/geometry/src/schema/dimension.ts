// EZD-216 (03 Q-0667 "a dimension has kind (linear or angular), two points or a wall and face, offset, override text
// or none, auto (overall, room or none) and its room"; 05 Q-0682 "Angular dimension: click two walls, then where the
// arc goes"; 09-calculations Q-0664 "Dimensions"; 03f Annotation): a dimension placed with the Dimension tool (L),
// or one of the auto dimensions every room and floor gets.
// - `geometry` is where the measured value comes from:
//   - `points`: two points (`from`, `to`) in model inches;
//   - `wall_face`: one face of a wall (`left` or `right` walking start to end, as `thicknessSide`), measured from the
//     wall's current face, so it follows the wall;
//   - `walls`: an angular dimension between two walls, with `at` the point the arc passes through (it picks the
//     sector and the radius);
//   - `auto`: an auto dimension's `axis` (`x` width, `y` depth); the value is the room's inside bounding box or the
//     floor's outer wall extents, worked out each time it is drawn (09-calculations Q-0664).
// - `attributes.offset`: the dimension line's distance from what it measures, in inches, outward (see
//   dimensions/measure.ts); an angular dimension keeps 0, its arc runs through `at`.
// - `attributes.override`: the text typed over the measured value, or null.
// - `attributes.auto`: `overall`, `room` or null; `attributes.room`: the auto room dimension's room, else null.
// A new type, so the schema version stays.
import * as z from 'zod/mini';
import { levelSchema, objectStatusSchema, pointSchema } from './common';
import { overrideTextSchema } from './text';

export const DIMENSION_KINDS = ['linear', 'angular'] as const;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];
export const DIMENSION_FACES = ['left', 'right'] as const;
export type DimensionFace = (typeof DIMENSION_FACES)[number];
export const AUTO_DIMENSIONS = ['overall', 'room'] as const;
export type AutoDimension = (typeof AUTO_DIMENSIONS)[number];
export const DIMENSION_AXES = ['x', 'y'] as const;
export type DimensionAxis = (typeof DIMENSION_AXES)[number];

const pointsGeometry = z.strictObject({
  kind: z.literal('points'),
  from: pointSchema,
  to: pointSchema,
});
const wallFaceGeometry = z.strictObject({
  kind: z.literal('wall_face'),
  wallId: z.uuid(),
  face: z.enum(DIMENSION_FACES),
});
const wallsGeometry = z.strictObject({
  kind: z.literal('walls'),
  wallIds: z.tuple([z.uuid(), z.uuid()]),
  at: pointSchema,
});
const autoGeometry = z.strictObject({ kind: z.literal('auto'), axis: z.enum(DIMENSION_AXES) });

export const dimensionGeometrySchema = z.discriminatedUnion('kind', [
  pointsGeometry,
  wallFaceGeometry,
  wallsGeometry,
  autoGeometry,
]);
export type DimensionGeometry = z.infer<typeof dimensionGeometrySchema>;

const dimensionShape = z.strictObject({
  geometry: dimensionGeometrySchema,
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(DIMENSION_KINDS),
    offset: z.number(),
    override: z.nullable(overrideTextSchema),
    auto: z.nullable(z.enum(AUTO_DIMENSIONS)),
    room: z.nullable(z.uuid()),
  }),
});

// The parts must agree: angular ⇔ two walls; auto ⇔ an axis; an auto room dimension, and only it, names its room.
function consistent(d: z.infer<typeof dimensionShape>): boolean {
  const g = d.geometry;
  const a = d.attributes;
  if ((a.kind === 'angular') !== (g.kind === 'walls')) return false;
  if ((a.auto !== null) !== (g.kind === 'auto')) return false;
  if ((a.auto === 'room') !== (a.room !== null)) return false;
  if (g.kind === 'walls' && g.wallIds[0].toLowerCase() === g.wallIds[1].toLowerCase()) return false;
  return true;
}

export const dimensionDataSchema = dimensionShape.check(z.refine(consistent));
export type DimensionData = z.infer<typeof dimensionDataSchema>;
