// EZD-733 (phase-07 EZD-733 "Tile pattern, start point and visible cuts on the plan and the elevations, stored in the
// model"; S19 "Tile pattern select | Straight / diagonal / herringbone"; 09i Tile "layout preview (pattern, start
// point, visible cuts on elevations ...)"; vault/build/assumptions.md EZD-733): a tile layout on a room's floor or on
// one face of a wall. Only the layout is stored; the pieces and their cuts are worked out from it (tile/layout.ts).
//
// Start point: the corner of one whole tile the layout is laid from.
// - On a floor it is a plan point (model inches, y up).
// - On a wall face it is { x: distance along the wall's line from the wall's start point, y: height above the floor }.
//   The face is the wall's left or right side, seen walking from its start to its end (as walls/wall.ts), and the tile
//   runs from the floor to `height` (09i Wall tile "to its set height").
// A tile's width runs along x of its frame (along the wall, or across the plan page); its height along y.
// A new type, so the schema version stays.
import * as z from 'zod/mini';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const TILE_PATTERNS = ['straight', 'diagonal', 'herringbone'] as const;
export type TilePattern = (typeof TILE_PATTERNS)[number];
export const tilePatternSchema = z.enum(TILE_PATTERNS);

export const TILE_WALL_SIDES = ['left', 'right'] as const;
export type TileWallSide = (typeof TILE_WALL_SIDES)[number];

const positive = z.number().check(z.positive());

export const tileLayoutHostSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('floor'), roomId: z.uuid() }),
  z.strictObject({
    kind: z.literal('wall'),
    wallId: z.uuid(),
    side: z.enum(TILE_WALL_SIDES),
    height: positive,
  }),
]);
export type TileLayoutHost = z.infer<typeof tileLayoutHostSchema>;

export const tileLayoutDataSchema = z.strictObject({
  geometry: z.strictObject({ host: tileLayoutHostSchema, start: pointSchema }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    pattern: tilePatternSchema,
    tileWidth: positive,
    tileHeight: positive,
    // The grout joint between tiles; 0 is butted.
    joint: z.number().check(z.gte(0)),
  }),
});
export type TileLayoutData = z.infer<typeof tileLayoutDataSchema>;

// A new layout's sizes (assumptions.md EZD-733): 12" x 24" tile, 1/8" joint, straight; a wall layout runs to 96".
export const DEFAULT_TILE_WIDTH = 12;
export const DEFAULT_TILE_HEIGHT = 24;
export const DEFAULT_TILE_JOINT = 0.125;
export const DEFAULT_WALL_TILE_HEIGHT = 96;
