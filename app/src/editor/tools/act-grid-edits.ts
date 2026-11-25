// EZD-511 (S05 Controls "Acoustical grid | Ceiling rail | Places a 2x2 or 2x4 ACT grid in a room; set direction and
// start point. Grid auto-balances borders. | Edit model."; S05 Validation "ACT balanced borders ... Balancing picks the
// start point that meets this; warn if the user overrides it. Minimum border is a company setting under Defaults.";
// AC-EZD-511-1; vault/build/assumptions.md EZD-511 rows): a new grid on the room under a click, and the grid
// inspector's edits. Each is one change (one undo step), checked against the act_grid schema. Loaded with the Ceiling
// view's lazy module (rcp.ts) and the inspector, never in the editor's first download (11 Budgets).
import {
  CURRENT_SCHEMA_VERSION,
  actBorderSizes,
  actBorderWarnings,
  actGridLayout,
  actTileAt,
  balancedActStart,
  parseLength,
  parseStoredObject,
  roomCeilingType,
  type ActBorderWarning,
  type ActDirection,
  type ActGridData,
  type ActGridLayout,
  type ActModule,
  type ModelObject,
  type ObjectStatus,
  type Point,
} from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import { levelModelObjects } from '../inspector/inspector-edits';
import type { Change, Objects } from '../model/patches';
import { roomAt } from './beam-edits';

type RoomObject = Extract<ModelObject, { type: 'room' }>;
export type ActGridObject = { id: string; data: ActGridData };

function storeGrid(id: string, data: ActGridData): Change | null {
  const r = parseStoredObject({ id, type: 'act_grid', schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!r.ok) return null;
  return {
    id,
    value: {
      type: 'act_grid',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: r.object.data as unknown as Record<string, unknown>,
    },
  };
}

/** The grid stored under `id` (any case), or null when there is none or it does not parse. */
export function actGridOf(objects: Objects, id: string): ActGridObject | null {
  const lower = id.toLowerCase();
  for (const [key, v] of objects) {
    if (key.toLowerCase() !== lower || v.type !== 'act_grid') continue;
    const r = parseStoredObject({ id: key, type: v.type, schema_version: v.schemaVersion, data: v.data });
    return r.ok && r.object.type === 'act_grid' ? { id: key, data: r.object.data } : null;
  }
  return null;
}

/** The room a grid is on, read from the grid's floor; null when the room is gone. */
export function actGridRoom(objects: Objects, grid: ActGridObject): RoomObject | null {
  const roomId = grid.data.geometry.roomId.toLowerCase();
  for (const o of levelModelObjects(objects, grid.data.level))
    if (o.type === 'room' && o.id.toLowerCase() === roomId) return o;
  return null;
}

/** The grid on a room (one per room), or null. */
export function actGridOnRoom(objects: Objects, level: string, roomId: string): ActGridObject | null {
  const lower = roomId.toLowerCase();
  for (const o of levelModelObjects(objects, level))
    if (o.type === 'act_grid' && o.data.geometry.roomId.toLowerCase() === lower)
      return { id: o.id, data: o.data };
  return null;
}

/** Whether a room's ceiling is flat (ACT goes on flat ceilings only). */
export const isFlatCeiling = (room: RoomObject): boolean =>
  roomCeilingType(room.data.attributes) === 'flat';

export type PlaceActGrid =
  | { kind: 'placed'; change: Change }
  /** The room already has a grid: it is selected instead. */
  | { kind: 'existing'; id: string }
  | { kind: 'refused'; messageKey: MessageKey };

/**
 * S05 "Places a 2x2 or 2x4 ACT grid in a room": a new balanced 2x2 grid with the long wall on the room under `at`.
 * A room that has one already gives that one; a click outside every room, or on a room whose ceiling is not flat,
 * is refused with a message.
 */
export function placeActGrid(
  objects: Objects,
  level: string,
  at: Point,
  status: ObjectStatus,
  newId: () => string,
  minShare: number,
): PlaceActGrid {
  const room = roomAt(objects, level, at);
  if (room === null) return { kind: 'refused', messageKey: 'office.ceiling.act.click_room' };
  const existing = actGridOnRoom(objects, level, room.id);
  if (existing !== null) return { kind: 'existing', id: existing.id };
  if (!isFlatCeiling(room)) return { kind: 'refused', messageKey: 'office.ceiling.act.flat_only' };
  const data: ActGridData = {
    geometry: { roomId: room.id, start: { x: 0, y: 0 } },
    status,
    level: room.data.level,
    attributes: { module: '2x2', direction: 'with_long_wall', balanced: true },
  };
  data.geometry.start = balancedActStart(data, room.data, minShare);
  const change = storeGrid(newId(), data);
  return change === null
    ? { kind: 'refused', messageKey: 'office.ceiling.act.place_failed' }
    : { kind: 'placed', change };
}

export type ActGridView = {
  module: ActModule;
  direction: ActDirection;
  balanced: boolean;
  status: ObjectStatus;
  roomName: string;
  layout: ActGridLayout;
  /** The first border in each direction: along a main, then across the mains (the Start point fields). */
  start: [number, number];
  /** The smaller border in each direction (the legend's "{a} and {b}"). */
  borders: [number, number];
  warnings: ActBorderWarning[];
};

/** What the inspector and the legend show for a grid; null when the grid or its room is gone. */
export function actGridView(objects: Objects, id: string, minShare: number): ActGridView | null {
  const grid = actGridOf(objects, id);
  if (grid === null) return null;
  const room = actGridRoom(objects, grid);
  if (room === null) return null;
  const layout = actGridLayout(grid.data, room.data, minShare);
  return {
    module: grid.data.attributes.module,
    direction: grid.data.attributes.direction,
    balanced: grid.data.attributes.balanced,
    status: grid.data.status,
    roomName: room.data.attributes.name,
    layout,
    start: [layout.alongMain.borders[0], layout.acrossMains.borders[0]],
    borders: actBorderSizes(layout),
    warnings: actBorderWarnings(grid.data, layout),
  };
}

export type ActGridEdit =
  | { field: 'module'; value: ActModule }
  | { field: 'direction'; value: ActDirection }
  /** A Start point field: the first border along a main (`along_main`) or across the mains, typed. */
  | { field: 'start'; direction: 'along_main' | 'across_mains'; text: string }
  /** Balance: back to the balanced start. */
  | { field: 'balance' };

export type ActGridEditResult = { ok: true; change: Change | null } | { ok: false; messageKey: MessageKey };

const FAILED: MessageKey = 'office.ceiling.act.place_failed';

/**
 * One inspector edit. A module or direction change keeps a balanced grid balanced (its start is worked out again); a
 * typed start point turns balancing off (S05 "warn if the user overrides it"); Balance turns it back on. `change` is
 * null when nothing changes.
 */
export function actGridEdit(
  objects: Objects,
  id: string,
  edit: ActGridEdit,
  minShare: number,
): ActGridEditResult {
  const grid = actGridOf(objects, id);
  if (grid === null) return { ok: false, messageKey: FAILED };
  const room = actGridRoom(objects, grid);
  if (room === null) return { ok: false, messageKey: FAILED };
  const a = grid.data.attributes;
  let next: ActGridData;
  switch (edit.field) {
    case 'module':
    case 'direction': {
      if (a[edit.field] === edit.value) return { ok: true, change: null };
      next = { ...grid.data, attributes: { ...a, [edit.field]: edit.value } };
      if (a.balanced)
        next = { ...next, geometry: { ...next.geometry, start: balancedActStart(next, room.data, minShare) } };
      break;
    }
    case 'balance': {
      if (a.balanced) return { ok: true, change: null };
      const balanced = { ...grid.data, attributes: { ...a, balanced: true } };
      next = {
        ...balanced,
        geometry: { ...balanced.geometry, start: balancedActStart(balanced, room.data, minShare) },
      };
      break;
    }
    case 'start': {
      const r = parseLength(edit.text, 'positive');
      if (!r.ok) return { ok: false, messageKey: r.messageKey };
      const layout = actGridLayout(grid.data, room.data, minShare);
      const axis = edit.direction === 'along_main' ? layout.alongMain : layout.acrossMains;
      const other = edit.direction === 'along_main' ? layout.acrossMains : layout.alongMain;
      if (r.inches >= axis.to - axis.from) return { ok: false, messageKey: 'office.ceiling.act.start_too_long' };
      // The new crossing: this direction's first line at the typed border, the other direction's lines kept.
      const s = axis.from + r.inches;
      const o = other.lines[0] ?? other.from + other.borders[0];
      const start = {
        x: axis.dir.x * s + other.dir.x * o,
        y: axis.dir.y * s + other.dir.y * o,
      };
      next = { ...grid.data, geometry: { ...grid.data.geometry, start }, attributes: { ...a, balanced: false } };
      break;
    }
  }
  const change = storeGrid(grid.id, next);
  return change === null ? { ok: false, messageKey: FAILED } : { ok: true, change };
}

/**
 * S05 Recessed light "in ACT areas, troffers snap into tiles" (vault/build/assumptions.md EZD-511 "Troffers"): a point
 * in a room with a grid moves to the centre of the whole tile under it, or the nearest whole tile; elsewhere it stays.
 */
export function snapToActTile(objects: Objects, level: string, at: Point, minShare: number): Point {
  const room = roomAt(objects, level, at);
  if (room === null) return at;
  const grid = actGridOnRoom(objects, level, room.id);
  if (grid === null) return at;
  const tile = actTileAt(actGridLayout(grid.data, room.data, minShare), at);
  return tile === null ? at : tile.center;
}
