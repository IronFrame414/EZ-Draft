// EZD-606 (S06 Controls "Existing panel ... panel label photo (AI reads brand, rating, spaces; user confirms),
// existing circuit list (typed or read from directory photo; user confirms)"; S06 Decisions "AI-read panel label and
// directory values must be confirmed before use"; 02 Stack "AI runs in jobs"; Q-0637 photo row): the two panel photo
// reads, shared by the browser and the server. A read answers values for the user to confirm, never model changes.
// Pure: no React, no Supabase.
import * as z from 'zod/mini';

export const PANEL_LABEL_PURPOSE = 'panel.label';
export const PANEL_DIRECTORY_PURPOSE = 'panel.directory';

export const PANEL_READS = ['label', 'directory'] as const;
export type PanelRead = (typeof PANEL_READS)[number];

export const PANEL_READ_PURPOSE: Readonly<Record<PanelRead, string>> = {
  label: PANEL_LABEL_PURPOSE,
  directory: PANEL_DIRECTORY_PURPOSE,
};

// Q-0637 photo row: the server takes at most 4,000,000 bytes of JPEG (the browser shrinks to 3,500,000).
export const PANEL_PHOTO_MAX_BYTES = 4_000_000;
export const PANEL_PHOTO_TYPES = ['image/jpeg', 'image/png'] as const;
export type PanelPhotoType = (typeof PANEL_PHOTO_TYPES)[number];

// The largest values a read may give: a residential panel of at most 84 spaces (S06 spaces), a 1,200 A service.
export const PANEL_MAX_SPACES = 84;
export const PANEL_MAX_AMPS = 1200;
export const DIRECTORY_MAX_CIRCUITS = PANEL_MAX_SPACES;
export const CIRCUIT_NAME_MAX = 80;

export const panelLabelSchema = z.strictObject({
  brand: z.nullable(z.string().check(z.minLength(1), z.maxLength(80))),
  rating: z.nullable(z.int().check(z.positive(), z.lte(PANEL_MAX_AMPS))),
  spaces: z.nullable(z.int().check(z.positive(), z.lte(PANEL_MAX_SPACES))),
});
export type PanelLabel = z.infer<typeof panelLabelSchema>;

export const directoryCircuitSchema = z.strictObject({
  space: z.int().check(z.positive(), z.lte(PANEL_MAX_SPACES)),
  name: z.string().check(z.maxLength(CIRCUIT_NAME_MAX)),
  breaker: z.int().check(z.positive(), z.lte(PANEL_MAX_AMPS)),
  poles: z.union([z.literal(1), z.literal(2)]),
});
export type DirectoryCircuit = z.infer<typeof directoryCircuitSchema>;

export const panelLabelOutputSchema = z.union([
  z.strictObject({ status: z.literal('read'), label: panelLabelSchema }),
  z.strictObject({ status: z.literal('unreadable') }),
]);
export type PanelLabelOutput = z.infer<typeof panelLabelOutputSchema>;

export const panelDirectoryOutputSchema = z.union([
  z.strictObject({
    status: z.literal('read'),
    circuits: z.array(directoryCircuitSchema).check(z.maxLength(DIRECTORY_MAX_CIRCUITS)),
  }),
  z.strictObject({ status: z.literal('unreadable') }),
]);
export type PanelDirectoryOutput = z.infer<typeof panelDirectoryOutputSchema>;

export type PanelReadOutput<R extends PanelRead> = R extends 'label'
  ? PanelLabelOutput
  : PanelDirectoryOutput;

export const panelReadOutputSchema = <R extends PanelRead>(read: R) =>
  (read === 'label' ? panelLabelOutputSchema : panelDirectoryOutputSchema) as z.ZodMiniType<
    PanelReadOutput<R>
  >;
