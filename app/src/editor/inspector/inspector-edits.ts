// EZD-213a Build step 6 (vault/plans/EZD-213a.md section 1, Decided "Purity", "levelModelObjects", "Selection ids",
// "Which objects a field takes", "Single-object fields", "Commit", "Wall fields -> changes", "Opening fields ->
// changes"; 04 Q-0630 row 20; Q-0645 (a)): one inspector field committed over the whole selection as one Change[] for
// one applyEdit (one undo step). Pure.
import {
  COMPARISON_TOLERANCE_IN,
  parseStoredObject,
  resizeOpening,
  resizeWall,
  setHand,
  setImpactRating,
  setOpeningHeight,
  setOpeningOffsetLeft,
  setRoughOpening,
  setShutterType,
  setSillHeight,
  setSwing,
  setWallBearing,
  setWallHeight,
  setWallLayer,
  setWallThickness,
  type DoorHand,
  type DoorSwing,
  type ImpactRating,
  type ModelObject,
  type NumberHighs,
  type OpeningEditResult,
  type OpeningObject,
  type ShutterType,
  type WallEditResult,
  type WallLayer,
  type WallObject,
} from '@ezdraft/geometry';
import type { Change, Objects } from '../model/patches';
import { openingChange, wallEditChanges } from '../tools/model-changes';

export type InspectorEdit =
  | {
      field:
        | 'wallLength'
        | 'wallThickness'
        | 'wallHeight'
        | 'openingWidth'
        | 'openingHeight'
        | 'sillHeight'
        | 'offsetLeft';
      inches: number;
    }
  | { field: 'wallBearing'; value: boolean }
  | { field: 'wallLayer'; index: number; layer: WallLayer }
  | { field: 'roughOpening'; width: number; height: number }
  | { field: 'impactRating'; value: ImpactRating }
  | { field: 'shutterType'; value: ShutterType }
  | { field: 'swing'; value: DoorSwing }
  | { field: 'hand'; value: DoorHand };

export type InspectorEditReason =
  | 'not_found'
  | 'not_applicable'
  | 'not_shared'
  | 'invalid_input'
  | 'not_positive'
  | 'negative'
  | 'no_stud'
  | 'stud_not_positive'
  | 'only_stud'
  | 'not_door'
  | 'not_window'
  | 'not_shutter'
  | 'zero_length'
  | 'too_long'
  | 'join_lost'
  | 'not_on_wall'
  | 'past_corner'
  | 'overlap';

export type InspectorEditResult =
  { ok: true; changes: Change[] } | { ok: false; reason: InspectorEditReason; id: string };

const lower = (id: string) => id.toLowerCase();

export function levelModelObjects(objects: Objects, level: string): ModelObject[] {
  const lvl = lower(level);
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
    const l = v.data.level;
    if (typeof l !== 'string' || lower(l) !== lvl) continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok) out.push(r.object);
  }
  return out;
}

const WALL_FIELDS: ReadonlySet<InspectorEdit['field']> = new Set([
  'wallLength',
  'wallThickness',
  'wallHeight',
  'wallBearing',
  'wallLayer',
]);

const SINGLE_OBJECT_FIELDS: ReadonlySet<InspectorEdit['field']> = new Set([
  'wallLength',
  'wallLayer',
  'offsetLeft',
  'swing',
  'hand',
]);

// Structural compare of plain stored values (Decided "Commit").
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(rb, k) && sameValue(ra[k], rb[k]));
}

type Step = { ok: true; changed: ModelObject[] } | { ok: false; reason: InspectorEditReason };

const fromWall = (r: WallEditResult): Step =>
  r.ok ? { ok: true, changed: [r.wall] } : { ok: false, reason: r.reason };

const fromOpening = (r: OpeningEditResult): Step =>
  r.ok ? { ok: true, changed: [r.opening] } : { ok: false, reason: r.reason };

function wallStep(working: readonly ModelObject[], wall: WallObject, edit: InspectorEdit): Step {
  switch (edit.field) {
    case 'wallLength': {
      const r = resizeWall(working, wall.id, 'end', edit.inches);
      if (!r.ok) {
        const reason =
          r.reason === 'wall_not_found'
            ? 'not_found'
            : r.reason === 'invalid_length'
              ? 'invalid_input'
              : r.reason;
        return { ok: false, reason };
      }
      return { ok: true, changed: r.changed.filter((o) => o.type === 'wall') };
    }
    case 'wallThickness':
      return fromWall(setWallThickness(wall, edit.inches));
    case 'wallHeight':
      return fromWall(setWallHeight(wall, edit.inches));
    case 'wallBearing':
      return fromWall(setWallBearing(wall, edit.value));
    case 'wallLayer':
      return fromWall(setWallLayer(wall, edit.index, edit.layer));
    default:
      return { ok: false, reason: 'not_applicable' };
  }
}

function openingStep(working: readonly ModelObject[], o: OpeningObject, edit: InspectorEdit): Step {
  switch (edit.field) {
    case 'openingWidth': {
      if (!Number.isFinite(edit.inches)) return { ok: false, reason: 'invalid_input' };
      if (edit.inches <= COMPARISON_TOLERANCE_IN) return { ok: false, reason: 'not_positive' };
      const r = resizeOpening(working, o.id, edit.inches, 'left');
      return r.ok ? { ok: true, changed: r.changed } : { ok: false, reason: r.reason };
    }
    case 'offsetLeft': {
      const r = setOpeningOffsetLeft(working, o.id, edit.inches);
      return r.ok ? { ok: true, changed: r.changed } : { ok: false, reason: r.reason };
    }
    case 'openingHeight':
      return fromOpening(setOpeningHeight(o, edit.inches));
    case 'sillHeight':
      return fromOpening(setSillHeight(o, edit.inches));
    case 'roughOpening':
      return fromOpening(setRoughOpening(o, { width: edit.width, height: edit.height }));
    case 'impactRating':
      return fromOpening(setImpactRating(o, edit.value));
    case 'shutterType':
      return fromOpening(setShutterType(o, edit.value));
    case 'swing':
      return fromOpening(setSwing(o, edit.value));
    case 'hand':
      return fromOpening(setHand(o, edit.value));
    default:
      return { ok: false, reason: 'not_applicable' };
  }
}

export function inspectorEditChanges(input: {
  objects: Objects;
  level: string;
  ids: readonly string[];
  edit: InspectorEdit;
  newId: () => string;
  highs: NumberHighs;
}): InspectorEditResult {
  const { objects, level, edit } = input;
  const ids = [...new Set(input.ids.map(lower))];
  if (ids.length === 0) return { ok: true, changes: [] };
  if (SINGLE_OBJECT_FIELDS.has(edit.field) && ids.length > 1)
    return { ok: false, reason: 'not_shared', id: ids[0]! };
  const wallField = WALL_FIELDS.has(edit.field);

  const stored = levelModelObjects(objects, level);
  const working = [...stored];
  const touched: string[] = [];
  const indexOf = (id: string) => working.findIndex((o) => lower(o.id) === id);

  for (const id of ids) {
    const i = indexOf(id);
    if (i < 0) return { ok: false, reason: 'not_found', id };
    const obj = working[i]!;
    let step: Step;
    if (wallField) {
      if (obj.type !== 'wall') return { ok: false, reason: 'not_applicable', id };
      step = wallStep(working, obj, edit);
    } else {
      if (obj.type !== 'opening') return { ok: false, reason: 'not_applicable', id };
      step = openingStep(working, obj, edit);
    }
    if (!step.ok) return { ok: false, reason: step.reason, id };
    for (const c of step.changed) {
      const key = lower(c.id);
      const k = indexOf(key);
      if (k >= 0) working[k] = c;
      else working.push(c);
      if (!touched.includes(key)) touched.push(key);
    }
  }

  const changed: ModelObject[] = [];
  for (const key of touched) {
    const now = working[indexOf(key)]!;
    const before = stored.find((o) => lower(o.id) === key);
    if (before !== undefined && sameValue(before.data, now.data)) continue;
    changed.push(now);
  }
  if (wallField) {
    const walls = changed.filter((o): o is WallObject => o.type === 'wall');
    return {
      ok: true,
      changes: wallEditChanges(objects, level, walls, input.newId, input.highs),
    };
  }
  return {
    ok: true,
    changes: changed.filter((o): o is OpeningObject => o.type === 'opening').map(openingChange),
  };
}
