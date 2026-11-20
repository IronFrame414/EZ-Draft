// EZD-411 (03c countertop_piece, countertop_edge; 03f "Countertop pieces, seams, cutouts"; 09f Countertop rules;
// S04b Data shown; AC-EZD-411-1; vault/build/assumptions.md EZD-411): one countertop piece is one object in the
// model. Its outline is the top as cut, overhangs included (board S04b: island cabinets 73 1/2 x 24 make a
// 76 1/2 x 37 1/2 top). Its edges are held inside the piece, one per outline side: edge i runs from outline[i] to
// outline[(i + 1) % n], so 03c's piece_id and segment are the piece and the edge's place in the list. Lengths are
// decimal inches and are never rounded (03g).
import { z } from 'zod';
import {
  levelSchema,
  objectStatusSchema,
  pointSchema,
  polygonSchema,
  unitVectorSchema,
} from './common';

// A piece is a handful of sides; the cap keeps one stored object bounded (as group.ts).
export const COUNTERTOP_OUTLINE_MAX = 200;
export const COUNTERTOP_NAME_MAX = 80;

// 03c countertop_edge kind. A wall edge stands against a wall and takes backsplash; every other kind is an exposed
// edge, where the edge profile applies (09f; S04b "Edge profile ... Applied to exposed edges only").
export const COUNTERTOP_EDGE_KINDS = ['exposed', 'wall', 'seating', 'flush'] as const;
export type CountertopEdgeKind = (typeof COUNTERTOP_EDGE_KINDS)[number];

// Pieces are lettered A, B, C ... (03c "label (A/B…)"); past Z the letters double (AA, AB ...).
export const COUNTERTOP_LABEL_PATTERN = /^[A-Z]{1,2}$/;

// EZD-413 (S04b "Seam ... seam drawn red dashed", footer "pieces, seams"; vault/build/assumptions.md EZD-413): an
// edge made by a seam carries the seam's id; both pieces either side of the seam hold the same id, so a seam counts
// and draws once. A seam edge is a joint: kind wall, no overhang, no splash, no profile.
export const COUNTERTOP_CUTOUT_KINDS = ['sink', 'cooktop'] as const;
export type CountertopCutoutKind = (typeof COUNTERTOP_CUTOUT_KINDS)[number];
export const COUNTERTOP_CUTOUTS_MAX = 20;

// `overhang` is how far the edge stands past the cabinet face below it (0 for flush and wall edges);
// `backsplashHeight` is set only on a wall edge (null there means no splash); `profileId` is the edge profile
// picked from the library, never on a wall edge.
export const countertopEdgeSchema = z
  .strictObject({
    kind: z.enum(COUNTERTOP_EDGE_KINDS),
    overhang: z.number().min(0).finite(),
    backsplashHeight: z.number().min(0).finite().nullable(),
    profileId: z.uuid().nullable(),
    seamId: z.uuid().optional(),
  })
  .refine((e) => e.kind === 'wall' || e.backsplashHeight === null)
  .refine((e) => e.kind !== 'wall' || e.profileId === null)
  .refine((e) => e.seamId === undefined || (e.kind === 'wall' && e.backsplashHeight === null));
export type CountertopEdge = z.infer<typeof countertopEdgeSchema>;

// EZD-413 (03f "Countertop pieces, seams, cutouts (sink, cooktop)"; S04b "Cutout | Place a sink or cooktop cutout";
// vault/build/assumptions.md EZD-413): a rectangular hole in the top. `center` is its middle; `axis` the unit
// direction its width runs along, its depth square to it. `fixtureId` is the sink or cooktop it was placed over
// (null when placed on a bare top); EZD-1602 reads that fixture's catalog cutout size.
export const countertopCutoutSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(COUNTERTOP_CUTOUT_KINDS),
  center: pointSchema,
  axis: unitVectorSchema,
  width: z.number().positive().finite(),
  depth: z.number().positive().finite(),
  fixtureId: z.uuid().nullable(),
});
export type CountertopCutout = z.infer<typeof countertopCutoutSchema>;

export const countertopPieceDataSchema = z
  .strictObject({
    geometry: z.strictObject({
      outline: polygonSchema.max(COUNTERTOP_OUTLINE_MAX),
    }),
    status: objectStatusSchema,
    level: levelSchema,
    attributes: z.strictObject({
      label: z.string().regex(COUNTERTOP_LABEL_PATTERN),
      name: z.string().trim().max(COUNTERTOP_NAME_MAX),
      materialItemId: z.uuid().nullable(),
      thickness: z.number().positive().finite(),
      edges: z.array(countertopEdgeSchema).max(COUNTERTOP_OUTLINE_MAX),
      // EZD-413: absent on pieces saved before cutouts existed; read as none.
      cutouts: z.array(countertopCutoutSchema).max(COUNTERTOP_CUTOUTS_MAX).optional(),
    }),
  })
  .refine((d) => d.attributes.edges.length === d.geometry.outline.length)
  .refine((d) => d.geometry.outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
export type CountertopPieceData = z.infer<typeof countertopPieceDataSchema>;
