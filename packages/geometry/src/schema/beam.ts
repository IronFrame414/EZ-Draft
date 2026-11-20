// EZD-505 (S05 Controls "Beam", "Placement select", "Height AFF input", "Match select", "Size W x H input", "Spacing
// input", "Count input", "Length input", "Direction select", "End detail select"; S05 Data shown "beams (size,
// length, spacing/count, direction, placement, height, finish, end detail)"; 03f "Ceiling objects: beams"): one
// `beam` object is a beam set on one room's ceiling. The beams themselves are worked out from the room
// (ceiling/beams.ts), never stored. The finish joins with EZD-516. A new type, so the version stays.
import { z } from 'zod';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const BEAM_PLACEMENTS = ['level_in_vault', 'follow_slope', 'on_flat'] as const;
export type BeamPlacement = (typeof BEAM_PLACEMENTS)[number];

export const BEAM_MATCHES = ['adjoining', 'custom'] as const;
export type BeamMatch = (typeof BEAM_MATCHES)[number];

export const BEAM_DIRECTIONS = ['across_ridge', 'with_ridge'] as const;
export type BeamDirection = (typeof BEAM_DIRECTIONS)[number];

export const BEAM_END_DETAILS = ['square', 'corbel'] as const;
export type BeamEndDetail = (typeof BEAM_END_DETAILS)[number];

const positive = z.number().finite().positive();

// S05 "Spacing input: On-center spacing across the span. Mutually exclusive with Count."
export const beamLayoutSchema = z.discriminatedUnion('by', [
  z.strictObject({ by: z.literal('spacing'), spacing: positive }),
  z.strictObject({ by: z.literal('count'), count: z.int().min(1).max(200) }),
]);
export type BeamLayoutBy = z.infer<typeof beamLayoutSchema>;

export const beamDataSchema = z.strictObject({
  // `roomId` is the ceiling the set sits on; `shift` is how far the set was moved from its centred place.
  geometry: z.strictObject({ roomId: z.uuid(), shift: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    placement: z.enum(BEAM_PLACEMENTS),
    // Bottom of beam above the finished floor, in inches (read for Level beams in vault).
    heightAff: positive,
    match: z.enum(BEAM_MATCHES),
    // The adjoining room Height AFF is copied from when Match is Adjoining room.
    matchRoomId: z.uuid().nullable(),
    width: positive,
    height: positive,
    layout: beamLayoutSchema,
    // null: wall to wall span (S05 "Default is wall to wall span").
    length: positive.nullable(),
    direction: z.enum(BEAM_DIRECTIONS),
    endDetail: z.enum(BEAM_END_DETAILS),
  }),
});
export type BeamData = z.infer<typeof beamDataSchema>;
