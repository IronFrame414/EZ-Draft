// EZD-233 (S03 Context menu "Mirror, Align, Group, Save as group, Set status"; S03 Decisions "Demo is set per object,
// from the status pill or Set status in the context menu. Multi-select works for many objects at once", "Save as
// group"; 04 Selection, undo and flags "Saved groups (e.g. vanity + mirror + light) can be placed again"; Q-0630 03
// row "Space flips swing only; Mirror swaps hand"; AC-EZD-233-1, -2; vault/build/assumptions.md EZD-233): the model
// changes of the context menu commands. Each command is one edit (one undo step). Pure; values that fail
// `parseStoredObject` are skipped, never thrown on. Loaded only with the context menu and the Fixtures panel.
import {
  CURRENT_SCHEMA_VERSION,
  moveSelection,
  parseStoredObject,
  type ModelObject,
  type NumberHighs,
  type ObjectStatus,
  type OpeningObject,
  type Point,
  type WallObject,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { MessageKey } from '../../server/messages/catalog';
import type { Change, Objects } from '../model/patches';
import {
  looseChange,
  moveEditChanges,
  openingChange,
  wallEditChanges,
  type LooseObject,
} from '../tools/model-changes';
import { pasteChanges, type ClipItem } from './edit-changes';

export type ArrangeContext = {
  objects: Objects;
  level: string;
  ids: readonly string[];
  newId: () => string;
  highs: NumberHighs;
};

// `ids`, when given, is the selection after the command.
export type ArrangeResult =
  { ok: true; changes: Change[]; ids?: string[] } | { ok: false; messageKey: MessageKey };

const NOTHING: ArrangeResult = { ok: true, changes: [] };

const lower = (id: string) => id.toLowerCase();

function parse(id: string, value: ObjectValue): ModelObject | null {
  const r = parseStoredObject({
    id,
    type: value.type,
    schema_version: value.schemaVersion,
    data: value.data,
  });
  return r.ok ? r.object : null;
}

// The selected objects of `level`, once each, in selection order; a group's own object is never one of them.
function selectedOn(ctx: ArrangeContext, types: ReadonlySet<string>): ModelObject[] {
  const byLower = new Map<string, string>();
  for (const id of ctx.objects.keys()) byLower.set(lower(id), id);
  const lvl = lower(ctx.level);
  const seen = new Set<string>();
  const out: ModelObject[] = [];
  for (const id of ctx.ids) {
    const key = byLower.get(lower(id));
    if (key === undefined || seen.has(lower(key))) continue;
    const value = ctx.objects.get(key)!;
    if (!types.has(value.type)) continue;
    const o = parse(key, value);
    if (o === null || o.type === 'floor' || lower(o.data.level) !== lvl) continue;
    seen.add(lower(key));
    out.push(o);
  }
  return out;
}

const toValue = (o: ModelObject): ObjectValue => ({
  type: o.type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: o.data as unknown as Record<string, unknown>,
});

// ---- Mirror ----

const MIRROR_TYPES: ReadonlySet<string> = new Set(['wall', 'opening', 'fixture', 'utility_point']);

// The points that bound an object for Mirror and Align.
function pointsOf(o: ModelObject): Point[] {
  switch (o.type) {
    case 'wall':
      return [o.data.geometry.start, o.data.geometry.end];
    case 'opening':
    case 'blocking':
      return [o.data.geometry.center];
    case 'utility_point':
      return [o.data.geometry.point];
    case 'tile_shower':
      return o.data.geometry.footprint;
    case 'fixture': {
      const { center, axis } = o.data.geometry;
      const w = o.data.attributes.width / 2;
      const d = o.data.attributes.depth / 2;
      const left = { x: -axis.y, y: axis.x };
      return [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([a, b]) => ({
        x: center.x + a! * w * axis.x + b! * d * left.x,
        y: center.y + a! * w * axis.y + b! * d * left.y,
      }));
    }
    default:
      return [];
  }
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function boxOf(points: readonly Point[]): Box | null {
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

// Mirror flips the selection left to right about the vertical line through the middle of its box. A wall's ends are
// swapped as well as flipped, so it keeps walking the same way: a door on it keeps its swing and swaps its hand
// (Q-0630). An opening whose wall is not in the selection stays where it is and swaps its hand. A fixture's back
// stays on the same side; a utility point flips. Tile showers and blocking are left as they are.
export function mirrorChanges(ctx: ArrangeContext): ArrangeResult {
  const selected = selectedOn(ctx, MIRROR_TYPES);
  if (selected.length === 0) return NOTHING;
  const box = boxOf(selected.flatMap(pointsOf));
  if (box === null) return NOTHING;
  const cx = (box.minX + box.maxX) / 2;
  const flip = (p: Point): Point => ({ x: 2 * cx - p.x, y: p.y });
  const flipAxis = (a: Point): Point => ({ x: a.x, y: a.y === 0 ? 0 : -a.y });

  const wallIds = new Set(selected.filter((o) => o.type === 'wall').map((o) => lower(o.id)));
  const walls: WallObject[] = [];
  const openings: OpeningObject[] = [];
  const loose: LooseObject[] = [];
  for (const o of selected) {
    if (o.type === 'wall') {
      const { start, end } = o.data.geometry;
      walls.push({ ...o, data: { ...o.data, geometry: { start: flip(end), end: flip(start) } } });
    } else if (o.type === 'opening') {
      const g = o.data.geometry;
      const a = o.data.attributes;
      // On a mirrored wall, or on no wall: flipped with the rest. On a wall that stays: kept where it is.
      const kept = g.hostWallId !== null && !wallIds.has(lower(g.hostWallId));
      const geometry = kept
        ? g
        : { ...g, center: flip(g.center), axis: g.axis === null ? null : flipAxis(g.axis) };
      const hand = a.hand === null ? null : a.hand === 'left' ? 'right' : 'left';
      openings.push({ ...o, data: { ...o.data, geometry, attributes: { ...a, hand } } });
    } else if (o.type === 'fixture') {
      const g = o.data.geometry;
      loose.push({
        ...o,
        data: { ...o.data, geometry: { center: flip(g.center), axis: flipAxis(g.axis) } },
      });
    } else if (o.type === 'utility_point') {
      loose.push({ ...o, data: { ...o.data, geometry: { point: flip(o.data.geometry.point) } } });
    }
  }

  const temp = new Map(ctx.objects);
  for (const o of openings) temp.set(o.id, openingChange(o).value!);
  const changes: Change[] =
    walls.length > 0 ? wallEditChanges(temp, ctx.level, walls, ctx.newId, ctx.highs) : [];
  const written = new Set(changes.map((c) => lower(c.id)));
  for (const o of openings) if (!written.has(lower(o.id))) changes.push(openingChange(o));
  for (const o of loose) changes.push(looseChange(o));
  return { ok: true, changes };
}

// ---- Align ----

export const ALIGN_EDGES = ['left', 'right', 'top', 'bottom'] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];

const ALIGN_TYPES: ReadonlySet<string> = new Set([
  'wall',
  'opening',
  'fixture',
  'utility_point',
  'tile_shower',
  'blocking',
]);

// Align moves each selected object so its edge lines up with the same edge of the whole selection (left: the
// leftmost; top: the highest on the plan). Two or more objects are needed. Walls stretch their neighbours and hosted
// openings slide along their wall, as in a Move.
export function alignChanges(ctx: ArrangeContext, edge: AlignEdge): ArrangeResult {
  const selected = selectedOn(ctx, ALIGN_TYPES);
  if (selected.length < 2) return NOTHING;
  const boxes = selected.map((o) => boxOf(pointsOf(o)));
  if (boxes.some((b) => b === null)) return NOTHING;
  const all = boxes as Box[];
  const target =
    edge === 'left'
      ? Math.min(...all.map((b) => b.minX))
      : edge === 'right'
        ? Math.max(...all.map((b) => b.maxX))
        : edge === 'top'
          ? Math.max(...all.map((b) => b.maxY))
          : Math.min(...all.map((b) => b.minY));

  let current: ModelObject[] = [];
  for (const [id, value] of ctx.objects) {
    const o = parse(id, value);
    if (o !== null) current.push(o);
  }
  const changed = new Map<string, ModelObject>();
  for (let i = 0; i < selected.length; i += 1) {
    const b = all[i]!;
    const delta =
      edge === 'left'
        ? { x: target - b.minX, y: 0 }
        : edge === 'right'
          ? { x: target - b.maxX, y: 0 }
          : edge === 'top'
            ? { x: 0, y: target - b.maxY }
            : { x: 0, y: target - b.minY };
    if (delta.x === 0 && delta.y === 0) continue;
    const r = moveSelection(current, [selected[i]!.id], delta);
    if (!r.ok) return { ok: false, messageKey: 'office.tools.move.failed' };
    const swap = new Map(r.changed.map((o) => [lower(o.id), o]));
    current = current.map((o) => swap.get(lower(o.id)) ?? o);
    for (const o of r.changed) changed.set(lower(o.id), o);
  }
  if (changed.size === 0) return NOTHING;
  return {
    ok: true,
    changes: moveEditChanges(ctx.objects, ctx.level, [...changed.values()], ctx.newId, ctx.highs),
  };
}

// ---- Set status ----

// A pin is always existing, a room takes its status from its walls' edits elsewhere, and a group has none.
const STATUS_TYPES: ReadonlySet<string> = new Set([
  'wall',
  'opening',
  'fixture',
  'utility_point',
  'tile_shower',
  'blocking',
]);

// Set status writes one status on every selected object that has one. A bearing wall is not set to Demo here: that
// needs the engineer prompt (S03 Validation), so the whole command is refused.
export function statusChanges(ctx: ArrangeContext, status: ObjectStatus): ArrangeResult {
  const selected = selectedOn(ctx, STATUS_TYPES);
  if (
    status === 'demo' &&
    selected.some((o) => o.type === 'wall' && o.data.attributes.bearing === true)
  )
    return { ok: false, messageKey: 'office.edit.bearing_demo' };
  const changes: Change[] = [];
  for (const o of selected) {
    if (!('status' in o.data) || o.data.status === status) continue;
    const next = parse(o.id, { ...toValue(o), data: { ...o.data, status } });
    if (next !== null) changes.push({ id: o.id, value: toValue(next) });
  }
  return { ok: true, changes };
}

// ---- Group ----

const GROUP_MEMBER_TYPES: ReadonlySet<string> = new Set([
  'wall',
  'opening',
  'fixture',
  'utility_point',
  'tile_shower',
  'blocking',
  'pin',
]);

type GroupRef = { id: string; level: string; memberIds: string[] };

function groupsIn(objects: Objects): GroupRef[] {
  const out: GroupRef[] = [];
  for (const [id, value] of objects) {
    if (value.type !== 'group') continue;
    const o = parse(id, value);
    if (o !== null && o.type === 'group')
      out.push({ id, level: o.data.level, memberIds: o.data.memberIds });
  }
  return out;
}

// Group makes one group of the selected objects (two or more). A member already in another group leaves it, and a
// group left with fewer than two members goes.
export function groupChanges(ctx: ArrangeContext): ArrangeResult {
  const members = selectedOn(ctx, GROUP_MEMBER_TYPES).map((o) => o.id);
  if (members.length < 2) return NOTHING;
  const taken = new Set(members.map(lower));
  const changes: Change[] = [];
  for (const g of groupsIn(ctx.objects)) {
    if (!g.memberIds.some((m) => taken.has(lower(m)))) continue;
    const left = g.memberIds.filter((m) => !taken.has(lower(m)));
    changes.push(
      left.length < 2
        ? { id: g.id, value: null }
        : {
            id: g.id,
            value: {
              type: 'group',
              schemaVersion: CURRENT_SCHEMA_VERSION,
              data: { level: g.level, memberIds: left },
            },
          },
    );
  }
  changes.push({
    id: ctx.newId(),
    value: {
      type: 'group',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: { level: ctx.level, memberIds: members },
    },
  });
  return { ok: true, changes, ids: members };
}

// Ungroup removes every group that holds a selected object; the objects stay selected.
export function ungroupChanges(ctx: ArrangeContext): ArrangeResult {
  const selected = new Set(ctx.ids.map(lower));
  const changes: Change[] = groupsIn(ctx.objects)
    .filter((g) => g.memberIds.some((m) => selected.has(lower(m))))
    .map((g) => ({ id: g.id, value: null }));
  return { ok: true, changes };
}

// ---- Saved groups ----

export const SAVED_GROUP_TYPES = [
  'wall',
  'opening',
  'fixture',
  'utility_point',
  'tile_shower',
] as const;
const SAVED_TYPES: ReadonlySet<string> = new Set(SAVED_GROUP_TYPES);

export type SavedGroupItem = {
  id: string;
  type: string;
  schemaVersion: number;
  data: Record<string, unknown>;
};
export type SavedGroupPayload = { items: SavedGroupItem[] };

// What Save as group stores: the selected walls, openings, fixtures, utility points and tile showers as they are.
export function savedGroupPayload(
  ctx: Pick<ArrangeContext, 'objects' | 'level' | 'ids'>,
): SavedGroupPayload | null {
  const items = selectedOn({ ...ctx, newId: () => '', highs: {} as NumberHighs }, SAVED_TYPES).map(
    (o) => ({ id: o.id, ...toValue(o) }),
  );
  return items.length === 0 ? null : { items };
}

// Placing a saved group puts a copy of it with new ids centred on `at`: walls, doors and windows as Paste places them,
// and fixtures, utility points and tile showers moved by the same distance. A utility point keeps its appliance only
// when that appliance is in the group too. `ids` names the placed objects.
export function placeSavedGroup(
  ctx: ArrangeContext,
  payload: SavedGroupPayload,
  at: Point,
): ArrangeResult {
  const refused: ArrangeResult = { ok: false, messageKey: 'office.saved_groups.place_failed' };
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return refused;
  const clip: ClipItem[] = [];
  const loose: LooseObject[] = [];
  const anchors: Point[] = [];
  const wallAnchors: Point[] = [];
  for (const i of payload.items) {
    if (!SAVED_TYPES.has(i.type)) continue;
    const o = parse(i.id, { type: i.type, schemaVersion: i.schemaVersion, data: i.data });
    if (o === null) continue;
    const points = o.type === 'fixture' ? [o.data.geometry.center] : pointsOf(o);
    anchors.push(...points);
    if (o.type === 'wall' || o.type === 'opening') {
      wallAnchors.push(...points);
      clip.push({ id: o.id, value: toValue(o) });
    } else if (o.type === 'fixture' || o.type === 'utility_point' || o.type === 'tile_shower') {
      loose.push(o);
    }
  }
  const box = boxOf(anchors);
  if (box === null) return refused;
  const d = { x: at.x - (box.minX + box.maxX) / 2, y: at.y - (box.minY + box.maxY) / 2 };
  const shift = (p: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });

  const changes: Change[] = [];
  const ids: string[] = [];
  const wb = boxOf(wallAnchors);
  if (wb !== null) {
    const centre = { x: (wb.minX + wb.maxX) / 2, y: (wb.minY + wb.maxY) / 2 };
    const r = pasteChanges(ctx.objects, ctx.level, clip, shift(centre), ctx.newId, ctx.highs);
    changes.push(...r.changes);
    ids.push(...r.ids);
  }
  const fixtureIds = new Map<string, string>();
  const newIds = loose.map((o) => {
    const id = ctx.newId();
    if (o.type === 'fixture') fixtureIds.set(lower(o.id), id);
    return id;
  });
  loose.forEach((o, n) => {
    const id = newIds[n]!;
    let next: ModelObject;
    if (o.type === 'fixture') {
      const g = o.data.geometry;
      next = {
        ...o,
        id,
        data: { ...o.data, level: ctx.level, geometry: { ...g, center: shift(g.center) } },
      };
    } else if (o.type === 'utility_point') {
      const serves = o.data.attributes.servesObjectId;
      next = {
        ...o,
        id,
        data: {
          ...o.data,
          level: ctx.level,
          geometry: { point: shift(o.data.geometry.point) },
          attributes: {
            ...o.data.attributes,
            servesObjectId: serves === null ? null : (fixtureIds.get(lower(serves)) ?? null),
          },
        },
      };
    } else {
      next = {
        ...o,
        id,
        data: {
          ...o.data,
          level: ctx.level,
          geometry: { footprint: o.data.geometry.footprint.map(shift) },
        },
      };
    }
    const checked = parse(id, toValue(next));
    if (checked === null) return;
    changes.push({ id, value: toValue(checked) });
    ids.push(id);
  });
  if (changes.length === 0) return refused;
  return { ok: true, changes, ids };
}
