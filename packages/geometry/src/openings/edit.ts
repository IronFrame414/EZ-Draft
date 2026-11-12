// EZD-213a Build step 3 (vault/plans/EZD-213a.md section 1, Decided "Purity", "Above 0 inches", "setOpeningHeight",
// "setRoughOpening", "setSillHeight", "Impact", "Swing, Hand", "setOpeningOffsetLeft"; Q-0630 sizes, rows 4, 14,
// "Door offset"; Q-0633 G6, G11; Q-0640 rows 5-1, 5-2; Q-0642 row 4; Q-0645 (a)): the inspector's door and window
// field edits. Pure: inputs are never mutated; each ok result is a new opening.
import type {
  DoorHand,
  DoorSwing,
  ImpactRating,
  ModelObject,
  OpeningData,
  ShutterType,
} from '../schema';
import { coordsEqual, COMPARISON_TOLERANCE_IN } from '../tolerance';
import type { WallObject } from '../walls/wall';
import { openingOffsets, placeAtOffset } from './offsets';
import { autoRoughOpening, type OpeningObject } from './opening';

export type OpeningEditReason =
  'invalid_input' | 'not_positive' | 'negative' | 'not_door' | 'not_window' | 'not_shutter';

export type OpeningEditResult =
  { ok: true; opening: OpeningObject } | { ok: false; reason: OpeningEditReason };

export type SetOffsetResult =
  | { ok: true; changed: OpeningObject[] }
  | {
      ok: false;
      reason: 'not_found' | 'not_on_wall' | 'invalid_input' | 'past_corner' | 'overlap';
      id: string;
    };

type Attributes = OpeningData['attributes'];

const refuse = (reason: OpeningEditReason): OpeningEditResult => ({ ok: false, reason });

const lower = (id: string) => id.toLowerCase();

// Non-finite first, then a value at or under 1/64" (Decided "Above 0 inches").
function sizeProblem(value: number): 'invalid_input' | 'not_positive' | null {
  if (!Number.isFinite(value)) return 'invalid_input';
  if (value <= COMPARISON_TOLERANCE_IN) return 'not_positive';
  return null;
}

function withAttributes(o: OpeningObject, attributes: Partial<Attributes>): OpeningObject {
  const a = o.data.attributes;
  return {
    ...o,
    data: {
      ...o.data,
      geometry: {
        ...o.data.geometry,
        center: { ...o.data.geometry.center },
        axis: o.data.geometry.axis === null ? null : { ...o.data.geometry.axis },
      },
      attributes: { ...a, roughOpening: { ...a.roughOpening }, ...attributes },
    },
  };
}

const done = (opening: OpeningObject): OpeningEditResult => ({ ok: true, opening });

export function setOpeningHeight(o: OpeningObject, height: number): OpeningEditResult {
  const problem = sizeProblem(height);
  if (problem !== null) return refuse(problem);
  const a = o.data.attributes;
  if (a.roughOpeningMode === 'auto')
    return done(
      withAttributes(o, {
        height,
        roughOpening: autoRoughOpening(a.kind, { width: a.width, height }),
      }),
    );
  return done(withAttributes(o, { height }));
}

export function setRoughOpening(
  o: OpeningObject,
  ro: { width: number; height: number },
): OpeningEditResult {
  if (!Number.isFinite(ro.width) || !Number.isFinite(ro.height)) return refuse('invalid_input');
  if (ro.width <= COMPARISON_TOLERANCE_IN || ro.height <= COMPARISON_TOLERANCE_IN)
    return refuse('not_positive');
  const current = o.data.attributes.roughOpening;
  if (coordsEqual(ro.width, current.width) && coordsEqual(ro.height, current.height))
    return done(withAttributes(o, {}));
  return done(
    withAttributes(o, {
      roughOpening: { width: ro.width, height: ro.height },
      roughOpeningMode: 'typed',
    }),
  );
}

export function setSillHeight(o: OpeningObject, sill: number): OpeningEditResult {
  if (o.data.attributes.kind !== 'window') return refuse('not_window');
  if (!Number.isFinite(sill)) return refuse('invalid_input');
  if (sill < 0) return refuse('negative');
  return done(withAttributes(o, { sillHeight: sill }));
}

export function setImpactRating(o: OpeningObject, rating: ImpactRating): OpeningEditResult {
  if (rating === 'shutter') return done(withAttributes(o, { impactRating: rating }));
  return done(withAttributes(o, { impactRating: rating, shutterType: null }));
}

export function setShutterType(o: OpeningObject, type: ShutterType): OpeningEditResult {
  if (o.data.attributes.impactRating !== 'shutter') return refuse('not_shutter');
  return done(withAttributes(o, { shutterType: type }));
}

export function setSwing(o: OpeningObject, swing: DoorSwing): OpeningEditResult {
  if (o.data.attributes.kind !== 'door') return refuse('not_door');
  return done(withAttributes(o, { swing }));
}

export function setHand(o: OpeningObject, hand: DoorHand): OpeningEditResult {
  if (o.data.attributes.kind !== 'door') return refuse('not_door');
  return done(withAttributes(o, { hand }));
}

const isWall = (x: ModelObject): x is WallObject => x.type === 'wall';

const isOpening = (x: ModelObject): x is OpeningObject => x.type === 'opening';

export function setOpeningOffsetLeft(
  objects: readonly ModelObject[],
  openingId: string,
  offset: number,
): SetOffsetResult {
  // (1) The opening.
  const o = objects.find(
    (x): x is OpeningObject => isOpening(x) && lower(x.id) === lower(openingId),
  );
  if (o === undefined) return { ok: false, reason: 'not_found', id: openingId };
  // (2) Its host on its level.
  const level = lower(o.data.level);
  const levelWalls = objects.filter(
    (x): x is WallObject => isWall(x) && lower(x.data.level) === level,
  );
  const hostId = o.data.geometry.hostWallId;
  const host = hostId === null ? undefined : levelWalls.find((w) => lower(w.id) === lower(hostId));
  if (host === undefined || openingOffsets(o, host, levelWalls) === null)
    return { ok: false, reason: 'not_on_wall', id: openingId };
  // (3) Placed at the typed left offset.
  const levelOpenings = objects.filter(
    (x): x is OpeningObject => isOpening(x) && lower(x.data.level) === level,
  );
  const r = placeAtOffset({
    host,
    walls: levelWalls,
    openings: levelOpenings,
    width: o.data.attributes.width,
    near: o.data.geometry.center,
    side: 'left',
    offset,
    ignoreId: o.id,
  });
  if (!r.ok) return { ok: false, reason: r.reason, id: openingId };
  // (4) The one changed opening.
  const moved = withAttributes(o, {});
  return {
    ok: true,
    changed: [
      {
        ...moved,
        data: {
          ...moved.data,
          geometry: { ...moved.data.geometry, center: { x: r.center.x, y: r.center.y } },
        },
      },
    ],
  };
}
