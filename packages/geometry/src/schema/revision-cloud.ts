// EZD-232 (S03 rail "Revision cloud | Draw a cloud and delta tag manually"; 03f Annotation "revision clouds"; Q-0200
// "clouds can also be added or removed by hand"; phase-02 EZD-232 "stored as an annotation of the same type EZD-704
// and EZD-718 use"): a revision cloud with its delta tag, on one level.
// - `geometry.boundary`: the closed outline the cloud's scallops follow, model inches (3 or more corners; the last
//   corner joins the first).
// - `geometry.tag`: where the delta tag sits, model inches.
// - `attributes.source`: `manual` for a cloud drawn with the tool, `auto` for one the revision rules add (EZD-718); an
//   undone change removes only its `auto` cloud (Q-0200).
// - `attributes.rev`: the revision number the delta shows, or null while the revision is not yet numbered (Rev N is
//   assigned only on the next send, EZD-718).
// No status: like a floor or a group, a cloud shows in every phase view. A new type, so the schema version stays.
import * as z from 'zod/mini';
import { levelSchema, pointSchema, polygonSchema } from './common';

export const REVISION_CLOUD_SOURCES = ['manual', 'auto'] as const;
export type RevisionCloudSource = (typeof REVISION_CLOUD_SOURCES)[number];

export const revisionCloudDataSchema = z.strictObject({
  geometry: z.strictObject({ boundary: polygonSchema, tag: pointSchema }),
  level: levelSchema,
  attributes: z.strictObject({
    source: z.enum(REVISION_CLOUD_SOURCES),
    rev: z.nullable(z.int().check(z.nonnegative())),
  }),
});
export type RevisionCloudData = z.infer<typeof revisionCloudDataSchema>;
