// Snap marker model (EZD-210a; vault/plans/EZD-210a.md section 3 C32-C35, Decided "Snap marker"; Q-0589 (a);
// S03 Snap; P206 `snap`). Pure: no React, no DOM.
import type { Point, SnapKind, SnapResult } from '@ezdraft/geometry';

export type SnapMarkerShape = 'square' | 'triangle' | 'bar' | 'arc' | 'cross';

export const SNAP_MARKER_SHAPES: Readonly<Record<SnapKind, SnapMarkerShape>> = {
  endpoint: 'square',
  midpoint: 'triangle',
  face: 'bar',
  angle: 'arc',
  increment: 'cross',
};

export type SnapMarker = {
  kind: SnapKind;
  shape: SnapMarkerShape;
  at: Point;
  wallId: string | null;
  angleDeg: number | null;
};

function angleFrom(anchor: Point, referenceDirection: Point | null, point: Point): number {
  const len = referenceDirection ? Math.hypot(referenceDirection.x, referenceDirection.y) : 0;
  const ref =
    referenceDirection && len > 0
      ? { x: referenceDirection.x / len, y: referenceDirection.y / len }
      : { x: 1, y: 0 };
  const v = { x: point.x - anchor.x, y: point.y - anchor.y };
  const delta = (Math.atan2(ref.x * v.y - ref.y * v.x, ref.x * v.x + ref.y * v.y) * 180) / Math.PI;
  return Math.round(Math.abs(delta) / 45) * 45;
}

export function snapMarker(
  result: SnapResult,
  ctx: { anchor: Point | null; referenceDirection: Point | null },
): SnapMarker | null {
  if (result.kind === null) return null;
  const at = { x: result.point.x, y: result.point.y };
  const angleDeg =
    result.kind === 'angle' && ctx.anchor !== null
      ? angleFrom(ctx.anchor, ctx.referenceDirection, at)
      : null;
  return {
    kind: result.kind,
    shape: SNAP_MARKER_SHAPES[result.kind],
    at,
    wallId: result.wallId,
    angleDeg,
  };
}
