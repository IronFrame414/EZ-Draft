// EZD-212a Build step 6 (vault/plans/EZD-212a.md section 1, Decided "`resizeOpening`"; 09k Door resize; Q-0657 (b);
// Q-0630 rows 1, 14; Q-0640 row 1; AC-EZD-211-13): a door or window width changes with one jamb kept; the offset on
// the kept side stays. Reads and returns only the changed opening; never mutates its input.
import { openingOffsets, placeAtOffset } from '../openings/offsets';
import {
  autoRoughOpening,
  isOpeningFlagged,
  leftEndIsLow,
  type OpeningObject,
} from '../openings/opening';
import type { ModelObject, Point } from '../schema';
import { coordsEqual } from '../tolerance';
import type { WallObject } from '../walls/wall';

export type ResizeOpeningResult =
  | { ok: true; changed: OpeningObject[] }
  | {
      ok: false;
      reason: 'not_found' | 'not_on_wall' | 'invalid_input' | 'past_corner' | 'overlap';
      id: string;
    };

const lower = (id: string) => id.toLowerCase();

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

const isOpening = (o: ModelObject): o is OpeningObject => o.type === 'opening';

function resized(o: OpeningObject, center: Point, width: number): OpeningObject {
  const a = o.data.attributes;
  return {
    ...o,
    data: {
      ...o.data,
      geometry: { ...o.data.geometry, center: { x: center.x, y: center.y } },
      attributes: {
        ...a,
        width,
        roughOpening:
          a.roughOpeningMode === 'auto'
            ? autoRoughOpening(a.kind, { width, height: a.height })
            : a.roughOpening,
      },
    },
  };
}

export function resizeOpening(
  objects: readonly ModelObject[],
  openingId: string,
  width: number,
  keep: 'left' | 'right',
): ResizeOpeningResult {
  // (1) The opening.
  const o = objects.find(
    (x): x is OpeningObject => isOpening(x) && lower(x.id) === lower(openingId),
  );
  if (o === undefined) return { ok: false, reason: 'not_found', id: openingId };
  // (2) The width.
  if (!Number.isFinite(width) || width <= 0)
    return { ok: false, reason: 'invalid_input', id: o.id };
  const center = o.data.geometry.center;
  // (3) Not on a wall: the kept jamb stays fixed along `axis`.
  if (isOpeningFlagged(o)) {
    const d = o.data.geometry.axis ?? { x: 1, y: 0 };
    const sL = leftEndIsLow(d, coordsEqual(d.x, 0)) ? -1 : 1;
    const s = keep === 'left' ? sL : -sL;
    const by = (s * (o.data.attributes.width - width)) / 2;
    return {
      ok: true,
      changed: [resized(o, { x: center.x + d.x * by, y: center.y + d.y * by }, width)],
    };
  }
  const level = lower(o.data.level);
  const levelWalls = objects.filter(
    (x): x is WallObject => isWall(x) && lower(x.data.level) === level,
  );
  const hostId = o.data.geometry.hostWallId!;
  const host = levelWalls.find((w) => lower(w.id) === lower(hostId));
  const offsets = host === undefined ? null : openingOffsets(o, host, levelWalls);
  if (host === undefined || offsets === null) return { ok: false, reason: 'not_on_wall', id: o.id };
  // (4) The kept side's offset holds.
  const levelOpenings = objects.filter(
    (x): x is OpeningObject => isOpening(x) && lower(x.data.level) === level,
  );
  const r = placeAtOffset({
    host,
    walls: levelWalls,
    openings: levelOpenings,
    width,
    near: center,
    side: keep,
    offset: offsets[keep],
    ignoreId: o.id,
  });
  if (!r.ok) return { ok: false, reason: r.reason, id: o.id };
  // (5) The one changed opening.
  return { ok: true, changed: [resized(o, r.center, width)] };
}
