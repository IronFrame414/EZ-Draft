// EZD-402 (03f Objects inside model_json "Cabinets as individual boxes"; S04 Data shown; AC-EZD-402-1;
// vault/build/assumptions.md EZD-402): the cabinet objects. A run is the ordered list of what stands along one wall
// in two rows, base and upper; each box, filler, panel, corner treatment and open shelf is its own object and its
// place in the run is its place in that list. Trim (toe kick, light rail, crown, valance) runs along a run's row.
// Lengths are decimal inches and are never rounded (03g); widths outside the 3" steps are custom boxes (S04
// Validation, Round 3).
import * as z from 'zod/mini';
import { levelSchema, objectStatusSchema, pointSchema, unitVectorSchema } from './common';

// A run is small; the cap keeps one stored object bounded (as group.ts).
export const CABINET_RUN_ROW_MAX = 200;
export const CABINET_CODE_MAX = 32;
export const CABINET_RUN_NAME_MAX = 80;
export const CABINET_FINISH_MAX = 120;

// S04 Data shown "type (base, wall, tall, vanity, sink base, drawer base, corner/blind, appliance panel)".
export const CABINET_BOX_TYPES = [
  'base',
  'wall',
  'tall',
  'vanity',
  'sink_base',
  'drawer_base',
  'corner_blind',
  'appliance_panel',
] as const;
export type CabinetBoxType = (typeof CABINET_BOX_TYPES)[number];

// S04 Face > Layout ("False drawer + 2 doors; 2 doors; Drawer + 2 doors", options depend on box type) plus the
// one-door, drawer-stack, open and panel faces the library rows need (assumptions.md EZD-402).
export const CABINET_FACE_LAYOUTS = [
  'door_1',
  'doors_2',
  'drawer_door_1',
  'drawer_doors_2',
  'false_drawer_door_1',
  'false_drawer_doors_2',
  'drawers_2',
  'drawers_3',
  'drawers_4',
  'open',
  'panel',
] as const;
export type CabinetFaceLayout = (typeof CABINET_FACE_LAYOUTS)[number];

// S04 Face > Hinges: Left / Pair / Right; a face with no door has none.
export const CABINET_HINGE_SIDES = ['left', 'pair', 'right', 'none'] as const;
export type CabinetHingeSide = (typeof CABINET_HINGE_SIDES)[number];

// S04 Face > Finished ends: None / Left / Right / Both.
export const CABINET_FINISHED_ENDS = ['none', 'left', 'right', 'both'] as const;
export type CabinetFinishedEnds = (typeof CABINET_FINISHED_ENDS)[number];

export const CABINET_PANEL_KINDS = ['end', 'decorative'] as const;
export type CabinetPanelKind = (typeof CABINET_PANEL_KINDS)[number];

export const CABINET_TRIM_KINDS = ['toe_kick', 'light_rail', 'crown', 'valance'] as const;
export type CabinetTrimKind = (typeof CABINET_TRIM_KINDS)[number];

export const CABINET_CORNER_KINDS = [
  'lazy_susan',
  'diagonal',
  'corner_filler',
  'dead_corner',
] as const;
export type CabinetCornerKind = (typeof CABINET_CORNER_KINDS)[number];

export const CABINET_ROWS = ['base', 'upper'] as const;
export type CabinetRow = (typeof CABINET_ROWS)[number];

const length = z.number().check(z.positive());
const codeSchema = z.string().check(z.trim(), z.minLength(1), z.maxLength(CABINET_CODE_MAX));
const catalogItemIdSchema = z.nullable(z.uuid());
const finishSchema = z.nullable(z.string().check(z.maxLength(CABINET_FINISH_MAX)));
const size = { width: length, depth: length, height: length };

// Run members have no geometry of their own: where each stands follows from the run's start, axis and order.
const member = <A extends z.core.$ZodLooseShape>(attributes: A) =>
  z.strictObject({
    status: objectStatusSchema,
    level: levelSchema,
    attributes: z.strictObject(attributes),
  });

export const cabinetBoxDataSchema = member({
  code: codeSchema,
  boxType: z.enum(CABINET_BOX_TYPES),
  ...size,
  faceLayout: z.enum(CABINET_FACE_LAYOUTS),
  hingeSide: z.enum(CABINET_HINGE_SIDES),
  finishedEnds: z.enum(CABINET_FINISHED_ENDS),
  catalogItemId: catalogItemIdSchema,
  finish: finishSchema,
});
export type CabinetBoxData = z.infer<typeof cabinetBoxDataSchema>;

// A filler's scribe allowance is how much of its width may be cut off to fit the wall (S04 "Carries a scribe
// allowance"); it cannot be more than the filler is wide.
export const cabinetFillerDataSchema = member({
  code: codeSchema,
  ...size,
  scribe: z.number().check(z.gte(0)),
  catalogItemId: catalogItemIdSchema,
  finish: finishSchema,
}).check(z.refine((d) => d.attributes.scribe <= d.attributes.width));
export type CabinetFillerData = z.infer<typeof cabinetFillerDataSchema>;

export const cabinetPanelDataSchema = member({
  kind: z.enum(CABINET_PANEL_KINDS),
  code: codeSchema,
  ...size,
  catalogItemId: catalogItemIdSchema,
  finish: finishSchema,
});
export type CabinetPanelData = z.infer<typeof cabinetPanelDataSchema>;

export const cabinetCornerDataSchema = member({
  kind: z.enum(CABINET_CORNER_KINDS),
  code: codeSchema,
  ...size,
  catalogItemId: catalogItemIdSchema,
  finish: finishSchema,
});
export type CabinetCornerData = z.infer<typeof cabinetCornerDataSchema>;

export const cabinetShelfDataSchema = member({
  code: codeSchema,
  ...size,
  shelfCount: z.int().check(z.gte(1), z.lte(20)),
  catalogItemId: catalogItemIdSchema,
  finish: finishSchema,
});
export type CabinetShelfData = z.infer<typeof cabinetShelfDataSchema>;

// Trim runs the full length of one row of its run; `height` is the trim's own face height.
export const cabinetTrimDataSchema = z.strictObject({
  geometry: z.strictObject({ runId: z.uuid(), row: z.enum(CABINET_ROWS) }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    kind: z.enum(CABINET_TRIM_KINDS),
    height: length,
    catalogItemId: catalogItemIdSchema,
    finish: finishSchema,
  }),
});
export type CabinetTrimData = z.infer<typeof cabinetTrimDataSchema>;

const rowSchema = z.array(z.uuid()).check(z.maxLength(CABINET_RUN_ROW_MAX));

// `start` is the run's left end at the wall face; the run goes along `axis`. A run off every wall has no host.
// An id appears at most once across both rows.
export const cabinetRunDataSchema = z
  .strictObject({
    geometry: z.strictObject({
      hostWallId: z.nullable(z.uuid()),
      start: pointSchema,
      axis: unitVectorSchema,
    }),
    level: levelSchema,
    attributes: z.strictObject({
      name: z.string().check(z.trim(), z.minLength(1), z.maxLength(CABINET_RUN_NAME_MAX)),
      base: rowSchema,
      upper: rowSchema,
    }),
  })
  .check(
    z.refine((d) => {
      const ids = [...d.attributes.base, ...d.attributes.upper].map((id) => id.toLowerCase());
      return new Set(ids).size === ids.length;
    }),
  );
export type CabinetRunData = z.infer<typeof cabinetRunDataSchema>;
