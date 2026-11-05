// EZD-238 Build step 6 (vault/plans/EZD-238.md section 3; 09h; Q-0507; Q-0574): the drawing list types and the
// view and dimension inputs. Model inches, y up; angles in degrees, counter-clockwise from +x.
import { z } from 'zod';
import { pointSchema, type Point } from '../schema';

export type LineWeightRole = 'cut' | 'beyond' | 'hidden' | 'dimension';
export type DrawingLayer = 'existing' | 'demo' | 'new' | 'rooms' | 'dimensions';
export type Segment = { from: Point; to: Point };

type ItemBase = { layer: DrawingLayer; objectId: string };
export type DrawingItem =
  | (ItemBase & { kind: 'line'; role: LineWeightRole; from: Point; to: Point })
  | (ItemBase & {
      kind: 'arc';
      role: LineWeightRole;
      center: Point;
      radius: number;
      startAngle: number;
      endAngle: number;
    })
  | (ItemBase & { kind: 'fill'; points: Point[] })
  | (ItemBase & { kind: 'hatch'; role: LineWeightRole; boundary: Point[]; segments: Segment[] })
  | (ItemBase & {
      kind: 'text';
      text: string;
      font: 'dm-mono-400';
      sizePt: number;
      widthPt: number;
      at: Point;
      rotationDeg: number;
      align: 'center';
    });

export type OmittedObject = {
  id: string;
  reason: 'zero_length' | 'not_on_wall' | 'host_not_found';
};
export type DrawingList = { level: string; items: DrawingItem[]; omitted: OmittedObject[] };

export const drawingViewSchema = z.strictObject({
  level: z.uuid(),
  dimensionTextPt: z.number().positive(),
  roomHatch: z.strictObject({ angleDeg: z.number(), spacingIn: z.number().positive() }).nullable(),
});
export type DrawingView = z.infer<typeof drawingViewSchema>;

export const dimensionInputSchema = z.strictObject({
  id: z.string().min(1),
  level: z.uuid(),
  from: pointSchema,
  to: pointSchema,
  offset: z.number(),
  text: z.string().min(1),
});
export type DimensionInput = z.infer<typeof dimensionInputSchema>;

// Q-0574 (a): every door is drawn hinged at the start end, opening to the left of the wall line.
export const DEFAULT_DOOR_SWING = { hinge: 'start', opensTo: 'left' } as const;
