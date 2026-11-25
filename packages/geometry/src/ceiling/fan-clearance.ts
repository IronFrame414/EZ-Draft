// EZD-515 (S05 Validation "Ceiling fan blade clearance to walls and beams: warning when closer than the clearance in
// company settings under Defaults", "Hosted ceiling item left off any ceiling surface: red flag, listed in the issue
// check"; S05 Decision 4; AC-EZD-515-1; vault/build/assumptions.md EZD-515): the fan clearance check and the
// off-ceiling flag. Pure; model inches, y up.
//
// Clearance is measured in plan from the blade circle (the fan's point, radius half the blade span) to the nearest
// wall face and to the nearest beam outline of a beam set on the fan's room. A gap under the clearance warns; exactly
// equal is fine. Demo walls, demo beams and demo fans are leaving, so they take no part. No clearance set (Not set)
// means no check. A hosted ceiling item whose centre is in no room outline on its floor is off the ceiling.
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { pointInRing } from '../rooms/area';
import { wallFaceLines } from '../walls/wall';
import { DEFAULT_FAN_BLADE_SPAN_IN, type ModelObject, type Point } from '../schema';
import { beamOutlines } from './beam-layout';

const tol = COMPARISON_TOLERANCE_IN;
type Room = Extract<ModelObject, { type: 'room' }>;

/** The distance from `p` to the segment a-b. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const k = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
}

function ringDistance(p: Point, ring: readonly Point[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++)
    d = Math.min(d, pointSegmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!));
  return d;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The room whose outline holds `p` on `level` (a point on the outline counts as inside); null when none does. */
export function hostRoom(p: Point, level: string, objects: readonly ModelObject[]): Room | null {
  for (const o of objects) {
    if (o.type !== 'room' || !same(o.data.level, level)) continue;
    const ring = o.data.geometry.boundary;
    if (pointInRing(p, ring) || ringDistance(p, ring) <= tol) return o;
  }
  return null;
}

/** The device kinds that hang on the ceiling (S05 Data shown "Ceiling objects"). */
const CEILING_DEVICE_KINDS: ReadonlySet<string> = new Set([
  'recessed_light',
  'ceiling_fan',
  'smoke_detector',
  'co_detector',
  'smoke_co_detector',
  'speaker',
  'camera',
  'wifi_ap',
]);
/** The HVAC kinds set in the ceiling: the registers. Air handlers and condensers are equipment, not ceiling items. */
const CEILING_HVAC_KINDS: ReadonlySet<string> = new Set(['supply', 'return']);

/** Where a hosted ceiling item sits, or null when the object is not a hosted ceiling item. */
export function hostedCeilingPoint(o: ModelObject): Point | null {
  if (o.type === 'device')
    return CEILING_DEVICE_KINDS.has(o.data.attributes.kind) ? o.data.geometry.point : null;
  if (o.type === 'access') return o.data.geometry.center;
  if (o.type === 'hvac')
    return CEILING_HVAC_KINDS.has(o.data.attributes.kind) ? o.data.geometry.center : null;
  return null;
}

/** S05 "Hosted ceiling item left off any ceiling surface": true when the item's centre is in no room on its floor. */
export function isOffCeiling(o: ModelObject, objects: readonly ModelObject[]): boolean {
  const p = hostedCeilingPoint(o);
  if (p === null || !('level' in o.data)) return false;
  return hostRoom(p, o.data.level, objects) === null;
}

/** The ids of every hosted ceiling item off the ceiling (for the issue check, EZD-716). */
export function offCeilingIds(objects: readonly ModelObject[]): string[] {
  return objects.filter((o) => isOffCeiling(o, objects)).map((o) => o.id);
}

export type FanClearanceWarning = {
  against: 'wall' | 'beam';
  /** The nearest wall or beam set. */
  objectId: string;
  /** Blade tip to the wall face or beam edge, inches; 0 when the blade reaches over it. */
  gap: number;
};

/** The fan's blade span: its own, else the default. */
export function fanBladeSpan(fan: Extract<ModelObject, { type: 'device' }>): number {
  return fan.data.attributes.bladeSpan ?? DEFAULT_FAN_BLADE_SPAN_IN;
}

/**
 * The clearance warnings of one ceiling fan among the model's objects: at most one against a wall and one against a
 * beam (the nearest). None when `clearance` is null (Not set), the object is not a fan, the fan is Demo or it is off
 * the ceiling.
 */
export function fanClearanceWarnings(
  fan: ModelObject,
  objects: readonly ModelObject[],
  clearance: number | null,
): FanClearanceWarning[] {
  if (clearance === null || fan.type !== 'device') return [];
  if (fan.data.attributes.kind !== 'ceiling_fan' || fan.data.status === 'demo') return [];
  const centre = fan.data.geometry.point;
  const level = fan.data.level;
  const room = hostRoom(centre, level, objects);
  if (room === null) return [];
  const radius = fanBladeSpan(fan) / 2;
  const out: FanClearanceWarning[] = [];

  let wall: { id: string; d: number } | null = null;
  for (const o of objects) {
    if (o.type !== 'wall' || o.data.status === 'demo' || !same(o.data.level, level)) continue;
    const { left, right } = wallFaceLines(o.data);
    const d = Math.min(
      pointSegmentDistance(centre, left.start, left.end),
      pointSegmentDistance(centre, right.start, right.end),
    );
    if (wall === null || d < wall.d) wall = { id: o.id, d };
  }
  if (wall !== null && wall.d - radius < clearance - tol)
    out.push({ against: 'wall', objectId: wall.id, gap: Math.max(0, wall.d - radius) });

  let beam: { id: string; d: number } | null = null;
  for (const o of objects) {
    if (o.type !== 'beam' || o.data.status === 'demo' || !same(o.data.geometry.roomId, room.id))
      continue;
    for (const quad of beamOutlines(o.data, room.data)) {
      const d = pointInRing(centre, quad) ? 0 : ringDistance(centre, quad);
      if (beam === null || d < beam.d) beam = { id: o.id, d };
    }
  }
  if (beam !== null && beam.d - radius < clearance - tol)
    out.push({ against: 'beam', objectId: beam.id, gap: Math.max(0, beam.d - radius) });
  return out;
}
