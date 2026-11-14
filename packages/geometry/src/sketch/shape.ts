// EZD-223 (S03 Sketch): a sketch stroke's shape and the points that draw it. Kept apart from `clean.ts` so the
// editor's first download carries only this, and the clean-up loads with the Sketch tool.
import type { Point } from '../schema/common';

export type SketchShape =
  | { kind: 'line'; from: Point; to: Point }
  // Angles in radians from +x; the arc runs from `start` through `sweep` (negative sweeps clockwise).
  | { kind: 'arc'; center: Point; radius: number; start: number; sweep: number }
  | { kind: 'circle'; center: Point; radius: number }
  | { kind: 'rectangle'; corners: readonly [Point, Point, Point, Point] }
  | { kind: 'raw'; points: readonly Point[] };

// Points along a shape, for drawing: arcs and circles as `segments`-sided runs.
export function sketchPoints(shape: SketchShape, segments = 48): Point[] {
  switch (shape.kind) {
    case 'line':
      return [shape.from, shape.to];
    case 'raw':
      return [...shape.points];
    case 'rectangle':
      return [...shape.corners, shape.corners[0]];
    case 'circle':
    case 'arc': {
      const start = shape.kind === 'arc' ? shape.start : 0;
      const sweep = shape.kind === 'arc' ? shape.sweep : 2 * Math.PI;
      const out: Point[] = [];
      for (let i = 0; i <= segments; i++) {
        const a = start + (sweep * i) / segments;
        out.push({
          x: shape.center.x + shape.radius * Math.cos(a),
          y: shape.center.y + shape.radius * Math.sin(a),
        });
      }
      return out;
    }
  }
}
