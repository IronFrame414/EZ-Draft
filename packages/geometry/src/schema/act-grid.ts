// EZD-511 (S05 Controls "Acoustical grid | Ceiling rail | Places a 2x2 or 2x4 ACT grid in a room; set direction and
// start point. Grid auto-balances borders."; S05 Data shown "ACT grid: module, direction, start point, border sizes";
// vault/build/assumptions.md EZD-511 "ACT grid data"): an acoustical ceiling grid on one room's flat ceiling.
// - `module`: 2x2 or 2x4 tiles.
// - `direction`: the main runners run with the room's longest wall (`with_long_wall`) or across it.
// - `start`: a grid line crossing in model inches. Read only while `balanced` is false; a balanced grid works its
//   start out from the room each time (ceiling/act-grid.ts), so it follows the room's walls.
// - `balanced`: true until the user sets the start point.
// The border sizes are worked out, never stored. One grid per room. A new type, so the schema version stays.
import * as z from 'zod/mini';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const ACT_MODULES = ['2x2', '2x4'] as const;
export type ActModule = (typeof ACT_MODULES)[number];
export const ACT_DIRECTIONS = ['with_long_wall', 'across_long_wall'] as const;
export type ActDirection = (typeof ACT_DIRECTIONS)[number];

export const actGridDataSchema = z.strictObject({
  geometry: z.strictObject({ roomId: z.uuid(), start: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    module: z.enum(ACT_MODULES),
    direction: z.enum(ACT_DIRECTIONS),
    balanced: z.boolean(),
  }),
});
export type ActGridData = z.infer<typeof actGridDataSchema>;
