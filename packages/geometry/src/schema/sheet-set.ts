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

// EZD-708c (S06 Controls "Add to E2.0 | Inspector, bottom | Places/updates panel schedule and load calc on sheet
// E2.0. | Edit model. If already placed, label reads "Update E2.0""; AC-EZD-708c-1, -2): what Add to E2.0 placed on
// the panel sheet, one entry per panel, in the order placed. Each entry holds the printed cells as the browser made
// them (app/src/lib/sheets/panel-sheet-table.ts), so the preview and the PDF print the same text (R7) and the sheet
// keeps what was placed until Update is pressed. Optional, so every stored set stays valid and the schema version
// stays (migrate.ts rule).
export const PANEL_SHEET_ENTRIES_MAX = 16;
export const PANEL_SHEET_ROWS_MAX = 200;
export const PANEL_SHEET_CELLS_MAX = 8;
const PANEL_SHEET_TEXT_MAX = 200;
const panelSheetRows = z
  .array(
    z
      .array(z.string().check(z.maxLength(PANEL_SHEET_TEXT_MAX)))
      .check(z.minLength(1), z.maxLength(PANEL_SHEET_CELLS_MAX)),
  )
  .check(z.maxLength(PANEL_SHEET_ROWS_MAX));
export const panelSheetEntrySchema = z.strictObject({
  panelId: z.uuid(),
  // The panel header, e.g. "Panel A · 200A main".
  title: z.string().check(z.minLength(1), z.maxLength(PANEL_SHEET_TEXT_MAX)),
  // One row per space, its cells in the schedule's column order.
  schedule: panelSheetRows,
  // Open spaces; null while the panel's spaces are not set.
  spacesLeft: z.nullable(z.number().check(z.int(), z.minimum(0))),
  // One row per load calc line, then amps and service; empty when the load calc is not complete.
  loadCalc: panelSheetRows,
});
export type PanelSheetEntry = z.infer<typeof panelSheetEntrySchema>;

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
    panelSheets: z.optional(z.array(panelSheetEntrySchema).check(z.maxLength(PANEL_SHEET_ENTRIES_MAX))),
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
    z.refine(
      (d) =>
        d.panelSheets === undefined ||
        new Set(d.panelSheets.map((p) => p.panelId.toLowerCase())).size === d.panelSheets.length,
    ),
  );
export type SheetSetData = z.infer<typeof sheetSetDataSchema>;
