// EZD-726 (03b Architecture rule 3; 03d sheet_set; S13 Decisions 8 and 10; 13b R3): a sheet set is a model object,
// frozen, reverted and diffed with the model. The 03d sheet_set row gives its fields. A set belongs to the whole
// project, so, like a floor, it names no level. The permit set is always 24x36 (stamped permit sets export ARCH D);
// the client set is 11x17 or 24x36.
import * as z from 'zod/mini';

export const SHEET_SET_KINDS = ['permit', 'client'] as const;
export type SheetSetKind = (typeof SHEET_SET_KINDS)[number];
export const SHEET_SIZES = ['24x36', '11x17'] as const;
export type SheetSize = (typeof SHEET_SIZES)[number];
export const KEY_PLACEMENTS = ['every_sheet', 'cover_only'] as const;
export type KeyPlacement = (typeof KEY_PLACEMENTS)[number];

// A set is small; the cap keeps one stored object bounded.
export const SHEET_SET_SHEETS_MAX = 500;

// EZD-703 (03b rule 3 "sheets, viewports ... are model objects"; 03c sheet "viewports, scale"; S13 Rail: Viewport;
// 09h "Scales per viewport"): a set's viewports, each on one sheet of the set (by its number, since sheets are not
// stored objects yet, EZD-701), held on the set object. The field is optional so every stored set stays valid and the
// schema version stays (migrate.ts rule); a sheet whose viewports were never changed shows its default viewports
// (app/src/lib/sheets/viewport.ts). A plan viewport draws one floor (`level`, null for the lowest) in one view; an
// elevation viewport draws nothing until the elevations sheet (EZD-707).
export const VIEWPORT_KINDS = ['plan', 'elevation'] as const;
export type ViewportKind = (typeof VIEWPORT_KINDS)[number];
export const SHEET_VIEWS = ['existing', 'demo', 'proposed'] as const;
export type SheetView = (typeof SHEET_VIEWS)[number];
// Architectural scales, inches on paper per foot, and not to scale.
export const VIEWPORT_SCALES = ['1/8', '3/16', '1/4', '3/8', '1/2', '3/4', '1', '1-1/2', '3', 'nts'] as const;
export type ViewportScale = (typeof VIEWPORT_SCALES)[number];
export const SHEET_SET_VIEWPORTS_MAX = 500;
const SHEET_NUMBER_MAX = 16;

export const viewportSchema = z.strictObject({
  id: z.uuid(),
  sheet: z.string().check(z.minLength(1), z.maxLength(SHEET_NUMBER_MAX)),
  kind: z.enum(VIEWPORT_KINDS),
  level: z.nullable(z.uuid()),
  view: z.enum(SHEET_VIEWS),
  scale: z.enum(VIEWPORT_SCALES),
  // EZD-707 (R24 "any other wall is added with Add elevation"): the walls an elevation viewport draws after the walls
  // its floor generates (the elevations sheet, packages/geometry elevations/wall-elevation.ts), in the order added.
  // Optional, so every stored viewport stays valid and the schema version stays.
  walls: z.optional(z.array(z.uuid()).check(z.maxLength(SHEET_SET_VIEWPORTS_MAX))),
});
export type Viewport = z.infer<typeof viewportSchema>;

export const sheetSetDataSchema = z
  .strictObject({
    kind: z.enum(SHEET_SET_KINDS),
    // The ids of the set's sheet objects, in set order.
    sheetIds: z.array(z.uuid()).check(z.maxLength(SHEET_SET_SHEETS_MAX)),
    size: z.enum(SHEET_SIZES),
    keyPlacement: z.enum(KEY_PLACEMENTS),
    submittalProfileId: z.nullable(z.uuid()),
    lastIssuedVersionId: z.nullable(z.uuid()),
    viewports: z.optional(z.array(viewportSchema).check(z.maxLength(SHEET_SET_VIEWPORTS_MAX))),
    // The sheets whose viewports were changed: theirs are the stored ones (none, when all were removed); every other
    // sheet shows its defaults. A sheet with a stored viewport counts as changed too.
    viewportSheets: z.optional(
      z
        .array(z.string().check(z.minLength(1), z.maxLength(SHEET_NUMBER_MAX)))
        .check(z.maxLength(SHEET_SET_SHEETS_MAX)),
    ),
  })
  .check(
    z.refine((d) => d.kind !== 'permit' || d.size === '24x36'),
    z.refine((d) => new Set(d.sheetIds.map((id) => id.toLowerCase())).size === d.sheetIds.length),
    z.refine(
      (d) =>
        d.viewports === undefined ||
        new Set(d.viewports.map((v) => v.id.toLowerCase())).size === d.viewports.length,
    ),
    z.refine((d) => d.viewportSheets === undefined || new Set(d.viewportSheets).size === d.viewportSheets.length),
  );
export type SheetSetData = z.infer<typeof sheetSetDataSchema>;
