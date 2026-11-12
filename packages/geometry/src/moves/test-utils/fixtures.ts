// EZD-212a · test fixtures (vault/plans/EZD-212a.md section 1 Build step 2; section 3 "test helper" row). Openings
// are built with `createOpeningData` (36" wide, `roughOpeningMode 'auto'`, P204a); `flaggedObj` copies an opening
// with no host and the given axis (Not on a wall).
import { createOpeningData, type OpeningObject } from '../../openings/opening';
import type { Point } from '../../schema';
import type { WallObject } from '../../walls/wall';

export const D2 = '00000000-0000-4000-8000-0000000000d2';
export const Y1 = '00000000-0000-4000-8000-0000000000e1';
export const Y2 = '00000000-0000-4000-8000-0000000000e2';

export function openingObj(
  id: string,
  kind: 'door' | 'window',
  host: WallObject,
  center: Point,
): OpeningObject {
  return { id, type: 'opening', data: createOpeningData({ kind, host, center }) };
}

export function flaggedObj(o: OpeningObject, axis: Point): OpeningObject {
  return {
    ...o,
    data: {
      ...o.data,
      geometry: {
        ...o.data.geometry,
        center: { x: o.data.geometry.center.x, y: o.data.geometry.center.y },
        hostWallId: null,
        axis: { x: axis.x, y: axis.y },
      },
    },
  };
}
