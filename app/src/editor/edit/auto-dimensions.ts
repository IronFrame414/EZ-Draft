// EZD-216 (09-calculations Q-0664 "Auto room dimensions: inside width and depth of each room's bounding box; auto
// overall: outer extents of all walls per axis"; 03 Q-0667 "an auto room dimension takes its room's status and the
// auto overall dimension is Existing"; Q-0686 case 1 (a) "a room or floor stored before this ticket gets its auto
// dimensions from the next wall edit on that floor; nothing is written on open", case 2 (a) "a wall-face dimension is
// deleted in the same edit as its wall"; S03 rail Dimension "Auto dimensions (overall, rooms) placed automatically";
// AC-EZD-216-4, -8): a change set with the auto dimension changes of every floor whose walls or rooms it changes,
// added at its end, so they are one undo step with the edit. As the bearing notes (bearing-rule.ts), the model store
// calls it on every edit (tools, inspector, multi-select, paste, Delete, Move), and Assistant Accept on the change set
// it saves (accept.ts). Opening a project makes no edit, so it writes nothing. Pure; values that do not parse are
// skipped.
import { autoDimensionChanges, parseStoredObject, type ModelObject } from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { applyEditTo, makeEdit, type Change, type Objects } from '../model/patches';
import { dimensionChange } from '../tools/model-changes';

// A change that moves what auto dimensions measure: a wall added, removed or reshaped (its line, thickness or side),
// or a room added, removed, reshaped or given a new status. A wall's status alone, a name or a finish is not one.
function measuredChange(was: ObjectValue | undefined, now: ObjectValue | null): boolean {
  const type = (now ?? was)?.type;
  if (type !== 'wall' && type !== 'room') return false;
  if (was === undefined || now === null || was.type !== now.type) return true;
  const key = (v: ObjectValue) => {
    const d = v.data as { geometry?: unknown; status?: unknown; attributes?: Record<string, unknown> };
    return JSON.stringify(
      type === 'wall'
        ? [d.geometry, d.attributes?.thickness, d.attributes?.thicknessSide]
        : [d.geometry, d.status],
    );
  };
  return key(was) !== key(now);
}

const READ_TYPES: ReadonlySet<string> = new Set(['wall', 'room', 'dimension']);

function parse(id: string, v: ObjectValue): ModelObject | null {
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  return r.ok ? r.object : null;
}

const levelOf = (v: ObjectValue | null | undefined): string | null => {
  const l = v?.data.level;
  return typeof l === 'string' ? l.toLowerCase() : null;
};

export function withAutoDimensions(
  objects: Objects,
  changes: Change[],
  newId: () => string,
): Change[] {
  const byLower = new Map<string, string>();
  for (const id of objects.keys()) byLower.set(id.toLowerCase(), id);
  const levels = new Set<string>();
  for (const c of changes) {
    const was = objects.get(byLower.get(c.id.toLowerCase()) ?? c.id);
    if (!measuredChange(was, c.value)) continue;
    for (const v of [c.value, was]) {
      const l = levelOf(v);
      if (l !== null) levels.add(l);
    }
  }
  if (levels.size === 0) return changes;
  const after = applyEditTo(objects, makeEdit(objects, changes), 'forward');
  const byLevel = new Map<string, ModelObject[]>();
  const realLevel = new Map<string, string>();
  for (const [id, v] of after) {
    if (!READ_TYPES.has(v.type)) continue;
    const l = levelOf(v);
    if (l === null || !levels.has(l)) continue;
    const o = parse(id, v);
    if (o === null) continue;
    realLevel.set(l, v.data.level as string);
    byLevel.set(l, [...(byLevel.get(l) ?? []), o]);
  }
  const extra: Change[] = [];
  for (const l of levels) {
    const objs = byLevel.get(l) ?? [];
    const level = realLevel.get(l) ?? l;
    // A floor deleted in the same change takes its dimensions with it (floors.ts deleteFloorChanges).
    if (objs.length === 0) continue;
    const auto = autoDimensionChanges(objs, level, newId);
    extra.push(
      ...auto.create.map(dimensionChange),
      ...auto.update.map(dimensionChange),
      ...auto.remove.map((id): Change => ({ id: byLower.get(id.toLowerCase()) ?? id, value: null })),
    );
  }
  return extra.length === 0 ? changes : [...changes, ...extra];
}
