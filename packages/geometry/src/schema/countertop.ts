// EZD-411 (03c countertop_piece, countertop_edge; 03f "Countertop pieces, seams, cutouts"; 09f Countertop rules;
// S04b Data shown; AC-EZD-411-1; vault/build/assumptions.md EZD-411): one countertop piece is one object in the
// model. Its outline is the top as cut, overhangs included (board S04b: island cabinets 73 1/2 x 24 make a
// 76 1/2 x 37 1/2 top). Its edges are held inside the piece, one per outline side: edge i runs from outline[i] to
// outline[(i + 1) % n], so 03c's piece_id and segment are the piece and the edge's place in the list. Lengths are
// decimal inches and are never rounded (03g).
import { z } from 'zod';
import { levelSchema, objectStatusSchema, polygonSchema } from './common';

// A piece is a handful of sides; the cap keeps one stored object bounded (as group.ts).
export const COUNTERTOP_OUTLINE_MAX = 200;
export const COUNTERTOP_NAME_MAX = 80;

// 03c countertop_edge kind. A wall edge stands against a wall and takes backsplash; every other kind is an exposed
// edge, where the edge profile applies (09f; S04b "Edge profile ... Applied to exposed edges only").
export const COUNTERTOP_EDGE_KINDS = ['exposed', 'wall', 'seating', 'flush'] as const;
export type CountertopEdgeKind = (typeof COUNTERTOP_EDGE_KINDS)[number];

// Pieces are lettered A, B, C ... (03c "label (A/B…)"); past Z the letters double (AA, AB ...).
export const COUNTERTOP_LABEL_PATTERN = /^[A-Z]{1,2}$/;

// `overhang` is how far the edge stands past the cabinet face below it (0 for flush and wall edges);
// `backsplashHeight` is set only on a wall edge (null there means no splash); `profileId` is the edge profile
// picked from the library, never on a wall edge.
export const countertopEdgeSchema = z
  .strictObject({
    kind: z.enum(COUNTERTOP_EDGE_KINDS),
    overhang: z.number().min(0).finite(),
    backsplashHeight: z.number().min(0).finite().nullable(),
    profileId: z.uuid().nullable(),
  })
  .refine((e) => e.kind === 'wall' || e.backsplashHeight === null)
  .refine((e) => e.kind !== 'wall' || e.profileId === null);
export type CountertopEdge = z.infer<typeof countertopEdgeSchema>;

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
    }),
  })
  .refine((d) => d.attributes.edges.length === d.geometry.outline.length)
  .refine((d) => d.geometry.outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
export type CountertopPieceData = z.infer<typeof countertopPieceDataSchema>;
