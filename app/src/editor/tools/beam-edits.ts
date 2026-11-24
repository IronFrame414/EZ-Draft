// EZD-505 (S05 Controls "Beam", "Placement select", "Height AFF input", "Match select", "Size W x H input", "Spacing
// input", "Count input", "Length input", "Direction select", "End detail select", "Spacing dimension pill"; S05
// Validation "Level beams in a vault must sit below the ridge and at or above the wall plate; warn otherwise"; S05
// Validation "Typed heights: invalid format shows inline error, value not applied"; AC-EZD-505-1): what the inspector
// and the spacing pill show for one beam set, and the edits they make. Pure: no React, no DOM. Every edit is checked
// against the beam schema and is one change (one undo step).
import {
  CURRENT_SCHEMA_VERSION,
  DETAIL_DISPLAY_DENOMINATOR,
  LENGTH_REFUSED_MESSAGE_KEY,
  adjoiningRoom,
  beamLayout,
  beamSetPickShape,
  beamSetWarnings,
  finishedCeilingHeight,
  formatLength,
  newBeamSet,
  parseLength,
  parseRoughOpening,
  parseStoredObject,
  pointInRing,
  outlineAreaSqIn,
  type BeamData,
  type BeamWarning,
  type ModelObject,
  type ObjectStatus,
  type Point,
  type RoomObject,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import { levelModelObjects } from '../inspector/inspector-edits';
import type { Change, Objects } from '../model/patches';
import { idKey } from '../shared/ids';

const detail = (inches: number) => formatLength(inches, DETAIL_DISPLAY_DENOMINATOR);

type BeamObject = { id: string; data: BeamData };
type Wall = Extract<ModelObject, { type: 'wall' }>;

/** The beam set stored under `id` (any case), or null when there is none or it does not parse. */
export function beamOf(objects: Objects, id: string): BeamObject | null {
  for (const [key, v] of objects) {
    if (idKey(key) !== idKey(id) || v.type !== 'beam') continue;
    const r = parseStoredObject({
      id: key,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    return r.ok && r.object.type === 'beam' ? { id: key, data: r.object.data } : null;
  }
  return null;
}

export const isBeam = (objects: Objects, id: string): boolean => {
  for (const [key, v] of objects) if (idKey(key) === idKey(id)) return v.type === 'beam';
  return false;
};

/** The change that stores `data` for the set; null when it does not parse. */
function storeBeam(id: string, data: BeamData): Change | null {
  const r = parseStoredObject({ id, type: 'beam', schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!r.ok) return null;
  return {
    id,
    value: {
      type: 'beam',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: r.object.data as unknown as Record<string, unknown>,
    },
  };
}

export type BeamView = {
  id: string;
  status: ObjectStatus;
  roomName: string | null;
  count: number;
  placement: BeamData['attributes']['placement'];
  match: BeamData['attributes']['match'];
  /** Whether Match can be Adjoining room: the set's room has an adjoining room. */
  canMatch: boolean;
  heightAff: string;
  size: string;
  /** The on-centre spacing, typed or computed from the count. */
  spacing: string;
  layoutBy: 'spacing' | 'count';
  countText: string;
  /** Empty when the beams run wall to wall. */
  length: string;
  direction: BeamData['attributes']['direction'];
  endDetail: BeamData['attributes']['endDetail'];
  warnings: BeamWarning[];
};

function context(objects: Objects, beam: BeamObject) {
  const all = levelModelObjects(objects, beam.data.level);
  const rooms = all.filter((o): o is RoomObject => o.type === 'room');
  const walls = all.filter((o): o is Wall => o.type === 'wall');
  const roomId = idKey(beam.data.geometry.roomId);
  const room = rooms.find((r) => idKey(r.id) === roomId) ?? null;
  return { all, rooms, walls, room };
}

export function beamView(objects: Objects, id: string): BeamView | null {
  const beam = beamOf(objects, id);
  if (beam === null) return null;
  const { all, rooms, room } = context(objects, beam);
  const a = beam.data.attributes;
  const layout = room === null ? null : beamLayout(beam.data, room.data);
  return {
    id: beam.id,
    status: beam.data.status,
    roomName: room?.data.attributes.name ?? null,
    count: layout?.beams.length ?? 0,
    placement: a.placement,
    match: a.match,
    canMatch: room !== null && adjoiningRoom(room, rooms) !== null,
    heightAff: detail(a.heightAff),
    size: `${detail(a.width)} × ${detail(a.height)}`,
    spacing: layout === null ? '' : detail(layout.spacing),
    layoutBy: a.layout.by,
    countText: String(layout?.count ?? (a.layout.by === 'count' ? a.layout.count : 0)),
    length: a.length === null ? '' : detail(a.length),
    direction: a.direction,
    endDetail: a.endDetail,
    warnings: beamSetWarnings(beam.data, all),
  };
}

export type BeamEdit =
  | { field: 'placement'; value: BeamData['attributes']['placement'] }
  | { field: 'match'; value: BeamData['attributes']['match'] }
  | { field: 'direction'; value: BeamData['attributes']['direction'] }
  | { field: 'endDetail'; value: BeamData['attributes']['endDetail'] }
  | { field: 'heightAff' | 'size' | 'spacing' | 'count' | 'length'; text: string };

export type BeamEditResult = { ok: true; change: Change } | { ok: false; messageKey: MessageKey };

const refused = (messageKey: MessageKey): BeamEditResult => ({ ok: false, messageKey });
const FAILED: MessageKey = 'office.beam.edit_failed';

/** One inspector or pill edit of a beam set, as a change; a refusal names its message. */
export function beamEdit(objects: Objects, id: string, edit: BeamEdit): BeamEditResult {
  const beam = beamOf(objects, id);
  if (beam === null) return refused(FAILED);
  const a = beam.data.attributes;
  let next: BeamData['attributes'];
  switch (edit.field) {
    case 'placement':
    case 'direction':
    case 'endDetail':
      next = { ...a, [edit.field]: edit.value };
      break;
    case 'match': {
      if (edit.value === 'custom') {
        next = { ...a, match: 'custom', matchRoomId: null };
        break;
      }
      const { rooms, walls, room } = context(objects, beam);
      const other = room === null ? null : adjoiningRoom(room, rooms);
      const height = other === null ? null : finishedCeilingHeight(other, walls);
      if (other === null || height === null) return refused('office.beam.no_adjoining');
      next = { ...a, match: 'adjoining', matchRoomId: other.id, heightAff: height };
      break;
    }
    case 'heightAff': {
      // S05 "Disabled when Match = Adjoining room (value copied)".
      if (a.match === 'adjoining') return refused(FAILED);
      const r = parseLength(edit.text, 'positive');
      if (!r.ok) return refused(r.messageKey);
      next = { ...a, heightAff: r.inches };
      break;
    }
    case 'size': {
      const r = parseRoughOpening(edit.text);
      if (!r.ok) return refused(r.messageKey);
      next = { ...a, width: r.width, height: r.height };
      break;
    }
    case 'spacing': {
      const r = parseLength(edit.text, 'positive');
      if (!r.ok) return refused(r.messageKey);
      next = { ...a, layout: { by: 'spacing', spacing: r.inches } };
      break;
    }
    case 'count': {
      const n = Number(edit.text.trim());
      if (!/^\d+$/.test(edit.text.trim()) || !Number.isInteger(n) || n < 1 || n > 200)
        return refused('office.beam.count_refused');
      next = { ...a, layout: { by: 'count', count: n } };
      break;
    }
    case 'length': {
      if (edit.text.trim() === '') {
        next = { ...a, length: null };
        break;
      }
      const r = parseLength(edit.text, 'positive');
      if (!r.ok) return refused(r.messageKey);
      next = { ...a, length: r.inches };
      break;
    }
  }
  const change = storeBeam(beam.id, { ...beam.data, attributes: next });
  return change === null ? refused(LENGTH_REFUSED_MESSAGE_KEY) : { ok: true, change };
}

/** The room on the open floor under `at`, smallest first; null when the point is in no room. */
export function roomAt(objects: Objects, level: string, at: Point): RoomObject | null {
  const rooms = levelModelObjects(objects, level).filter((o): o is RoomObject => o.type === 'room');
  let best: RoomObject | null = null;
  let bestArea = Infinity;
  for (const r of rooms) {
    const b = r.data.geometry.boundary;
    if (!pointInRing(at, b)) continue;
    const area = outlineAreaSqIn(b);
    if (area < bestArea) {
      best = r;
      bestArea = area;
    }
  }
  return best;
}

/** S05 "Places faux beams on the selected ceiling surface": a new set on the room under `at`. */
export function placeBeamSet(
  objects: Objects,
  level: string,
  at: Point,
  status: ObjectStatus,
  newId: () => string,
): Change | null {
  const room = roomAt(objects, level, at);
  if (room === null) return null;
  const data = newBeamSet(room, levelModelObjects(objects, level), status);
  return storeBeam(newId(), data);
}

/** Where the spacing pill sits: the middle of the set's far edge, the side with the largest y (top of the plan). */
export function beamPillAnchor(objects: Objects, id: string): Point | null {
  const beam = beamOf(objects, id);
  if (beam === null) return null;
  const { room } = context(objects, beam);
  if (room === null) return null;
  const shape = beamSetPickShape(beam.data, room.data);
  if (shape === null || shape.kind !== 'quad') return null;
  const top = Math.max(...shape.points.map((p) => p.y));
  const xs = shape.points.filter((p) => Math.abs(p.y - top) < 1e-6).map((p) => p.x);
  const all = shape.points.map((p) => p.x);
  const x =
    xs.length > 1
      ? (Math.min(...xs) + Math.max(...xs)) / 2
      : (Math.min(...all) + Math.max(...all)) / 2;
  return { x, y: top };
}
