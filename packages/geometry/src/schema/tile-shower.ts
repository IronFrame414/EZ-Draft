// EZD-234 Build (Q-0704 03-data-model row 2 "tile_shower"; 09-calculations Q-0704 "Tile shower: any positive size
// is stored"; 09q Tile shower): a site-built shower. `footprint` is a rectangle of four corners. Positions are in the
// shower's own frame: origin footprint[0], x toward footprint[1], y toward footprint[3]. A `side` is an edge index:
// edge i runs from footprint[i] to footprint[(i + 1) % 4]. The curb is measured above the top of the drain; null is
// curbless. Pan slope is inches per foot, 1/4" by default (P-045).
import { z } from 'zod';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { levelSchema, objectStatusSchema, pointSchema, type Point } from './common';

export const DEFAULT_PAN_SLOPE_IN_PER_FT = 0.25;

const sideSchema = z.int().min(0).max(3);
const positive = z.number().positive();

export const glassPieceSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('fixed'), length: positive, side: sideSchema }),
  z.strictObject({
    type: z.literal('door'),
    length: positive,
    side: sideSchema,
    swing: z.enum(['in', 'out']),
  }),
]);

export const showerDrainSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('center'), at: pointSchema }),
  z.strictObject({
    type: z.literal('linear'),
    side: sideSchema,
    offset: z.number().min(0),
    length: positive,
  }),
]);

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

// Four corners, both sides longer than the comparison tolerance, square corners and a closed parallelogram.
export function isRectangle(c: readonly Point[]): boolean {
  if (c.length !== 4) return false;
  const [p0, p1, p2, p3] = c as [Point, Point, Point, Point];
  const e0 = sub(p1, p0);
  const e1 = sub(p3, p0);
  const l0 = Math.hypot(e0.x, e0.y);
  const l1 = Math.hypot(e1.x, e1.y);
  if (l0 <= COMPARISON_TOLERANCE_IN || l1 <= COMPARISON_TOLERANCE_IN) return false;
  const square = Math.abs((e0.x * e1.x + e0.y * e1.y) / l0) <= COMPARISON_TOLERANCE_IN;
  const closes = Math.hypot(p2.x - (p1.x + e1.x), p2.y - (p1.y + e1.y)) <= COMPARISON_TOLERANCE_IN;
  return square && closes;
}

export const tileShowerDataSchema = z.strictObject({
  geometry: z.strictObject({ footprint: z.array(pointSchema).length(4).refine(isRectangle) }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    curb: z.strictObject({ height: positive, width: positive }).nullable(),
    niches: z.array(
      z.strictObject({
        width: positive,
        height: positive,
        bottomHeight: z.number().min(0),
        side: sideSchema,
      }),
    ),
    bench: z.strictObject({ width: positive, depth: positive, height: positive }).nullable(),
    glass: z.array(glassPieceSchema),
    panSlope: positive,
    drain: showerDrainSchema,
  }),
});
export type TileShowerData = z.infer<typeof tileShowerDataSchema>;
