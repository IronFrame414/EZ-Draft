// EZD-514 (S05 Validation "Keep-clear warning when a can lands on a joist or beam. Only where joist/beam locations are
// known (new construction, full demo, or user-entered). Otherwise no warning."; S05 States "Joists unknown: keep-clear
// checks off", "Joists known: keep-clear checks on"; AC-EZD-514-1, -2; vault/build/assumptions.md EZD-514): the
// keep-clear check. Pure; model inches, y up.
//
// A can is a circle of DEFAULT_CAN_DIAMETER_IN on its point. A framing member is a band of its width centred on its
// line; a line with a spacing repeats parallel to itself at that spacing on center, both ways across the room. A can
// whose circle overlaps any member band of its room warns; exactly touching is clear. Only recessed lights are
// checked, Demo cans are leaving, and a room whose framing is Unknown has its checks off.
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import {
  roomFraming,
  type FramingLine,
  type FramingMemberKind,
  type ModelObject,
  type Point,
} from '../schema';
import { hostRoom } from './fan-clearance';

const tol = COMPARISON_TOLERANCE_IN;
type Room = Extract<ModelObject, { type: 'room' }>;

/** A can with no size of its own reads as 4" (board S05Ceiling fixture schedule "A 4" can"). */
export const DEFAULT_CAN_DIAMETER_IN = 4;
/** Member widths: a joist is a 2x (1 1/2"), a beam a 4x or doubled 2x (3 1/2"). */
export const FRAMING_MEMBER_WIDTH_IN: Readonly<Record<FramingMemberKind, number>> = {
  joist: 1.5,
  beam: 3.5,
};

/** True when the room's keep-clear checks are on: its framing is anything but Unknown. */
export function keepClearOn(room: Room): boolean {
  return roomFraming(room.data.attributes).known !== 'unknown';
}

/** The distance from `p` to the nearest member line of `line` (the line itself, or a repeat when it has a spacing). */
export function framingLineDistance(p: Point, line: FramingLine): number {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const vx = p.x - line.start.x;
  const vy = p.y - line.start.y;
  const t = vx * ux + vy * uy;
  const along = t < 0 ? -t : t > L ? t - L : 0;
  const s = vx * -uy + vy * ux;
  const across = line.spacing === null ? s : s - Math.round(s / line.spacing) * line.spacing;
  return Math.hypot(along, across);
}

export type KeepClearWarning = {
  /** The room whose framing the can lands on. */
  roomId: string;
  /** The index of the nearest clashing line in the room's framing lines. */
  line: number;
  kind: FramingMemberKind;
};

/**
 * The keep-clear warning of one can among the model's objects, or null: none when the object is not a recessed light,
 * the can is Demo, it is in no room, or its room's framing is Unknown.
 */
export function keepClearWarning(
  can: ModelObject,
  objects: readonly ModelObject[],
): KeepClearWarning | null {
  if (can.type !== 'device' || can.data.attributes.kind !== 'recessed_light') return null;
  if (can.data.status === 'demo') return null;
  const p = can.data.geometry.point;
  const room = hostRoom(p, can.data.level, objects);
  if (room === null || !keepClearOn(room)) return null;
  const radius = DEFAULT_CAN_DIAMETER_IN / 2;
  let best: { line: number; kind: FramingMemberKind; over: number } | null = null;
  roomFraming(room.data.attributes).lines.forEach((line, i) => {
    const reach = radius + FRAMING_MEMBER_WIDTH_IN[line.kind] / 2;
    const over = reach - framingLineDistance(p, line);
    if (over > tol && (best === null || over > best.over))
      best = { line: i, kind: line.kind, over };
  });
  if (best === null) return null;
  const b: { line: number; kind: FramingMemberKind } = best;
  return { roomId: room.id, line: b.line, kind: b.kind };
}

/** The ids of every can with a keep-clear warning. */
export function keepClearIds(objects: readonly ModelObject[]): string[] {
  return objects.filter((o) => keepClearWarning(o, objects) !== null).map((o) => o.id);
}
