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

export const sheetSetDataSchema = z
  .strictObject({
    kind: z.enum(SHEET_SET_KINDS),
    // The ids of the set's sheet objects, in set order.
    sheetIds: z.array(z.uuid()).check(z.maxLength(SHEET_SET_SHEETS_MAX)),
    size: z.enum(SHEET_SIZES),
    keyPlacement: z.enum(KEY_PLACEMENTS),
    submittalProfileId: z.nullable(z.uuid()),
    lastIssuedVersionId: z.nullable(z.uuid()),
  })
  .check(
    z.refine((d) => d.kind !== 'permit' || d.size === '24x36'),
    z.refine((d) => new Set(d.sheetIds.map((id) => id.toLowerCase())).size === d.sheetIds.length),
  );
export type SheetSetData = z.infer<typeof sheetSetDataSchema>;
