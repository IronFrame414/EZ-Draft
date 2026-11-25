// EZD-1009 (03c design_option; 03b rules 3 and 4; 13b R3, R22; S07 Validation; vault/build/assumptions.md EZD-1009):
// a design option is a model object, frozen, reverted and diffed with the model. The 03c row gives its fields; its
// internal cost lines are a separate tenant table (design_option_cost_line), never in the model. Options sharing one
// groupId are one group (A, B, C, at most three). Like a sheet set, an option belongs to the project and names no
// level.
//
// `modelDelta` is a list of add, replace and remove patches by object id, applied over the working model in memory
// for display and never saved into it (03b rule 4; `options/apply.ts`). Each add or replace object is checked
// against its own type's schema in `schema/index.ts` (that check needs every type's schema, which this file cannot
// import). A patched object is held at the option's schema version.
import * as z from 'zod/mini';

export const DESIGN_OPTION_LABELS = ['A', 'B', 'C'] as const;
export type DesignOptionLabel = (typeof DESIGN_OPTION_LABELS)[number];
// S07 Validation "Maximum three options (A/B/C)".
export const DESIGN_OPTIONS_MAX = DESIGN_OPTION_LABELS.length;
export const DESIGN_OPTION_STATUSES = ['draft', 'sent', 'approved', 'archived'] as const;
export type DesignOptionStatus = (typeof DESIGN_OPTION_STATUSES)[number];

// One option is small; the cap keeps one stored object bounded.
export const DESIGN_OPTION_PATCHES_MAX = 500;
export const DESIGN_OPTION_NAME_MAX = 120;
export const DESIGN_OPTION_GROUP_NAME_MAX = 80;

const patchObjectSchema = z.strictObject({
  id: z.uuid(),
  type: z.string().check(z.minLength(1), z.maxLength(64)),
  data: z.unknown(),
});
export type DesignOptionPatchObject = z.infer<typeof patchObjectSchema>;

export const designOptionPatchSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('add'), object: patchObjectSchema }),
  z.strictObject({ op: z.literal('replace'), object: patchObjectSchema }),
  z.strictObject({ op: z.literal('remove'), id: z.uuid() }),
]);
export type DesignOptionPatch = z.infer<typeof designOptionPatchSchema>;

export const patchTargetId = (p: DesignOptionPatch): string =>
  p.op === 'remove' ? p.id : p.object.id;

const text = (max: number) =>
  z.string().check(
    z.maxLength(max),
    z.refine((s) => s.trim().length > 0),
  );

export const designOptionDataSchema = z
  .strictObject({
    groupId: z.uuid(),
    groupName: text(DESIGN_OPTION_GROUP_NAME_MAX),
    label: z.enum(DESIGN_OPTION_LABELS),
    name: text(DESIGN_OPTION_NAME_MAX),
    status: z.enum(DESIGN_OPTION_STATUSES),
    modelDelta: z.array(designOptionPatchSchema).check(z.maxLength(DESIGN_OPTION_PATCHES_MAX)),
  })
  // One patch per object id in an option (vault/build/assumptions.md EZD-1009).
  .check(
    z.refine(
      (d) =>
        new Set(d.modelDelta.map((p) => patchTargetId(p).toLowerCase())).size ===
        d.modelDelta.length,
    ),
  );
export type DesignOptionData = z.infer<typeof designOptionDataSchema>;
