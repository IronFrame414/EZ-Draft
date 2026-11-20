// EZD-215 (Q-0704 "Every change path calls that function ... The note is added in the same change, so it is one undo
// step"; AC-EZD-215-1, -2): a change set with the "Engineer required" notes it raises added at its end. The model
// store calls it on every edit (tools, inspector, multi-select, paste, Delete), and the Assistant preview calls it
// on the change set it builds, so AI Accept saves the note with the wall. Undo and redo replay the stored edit, note
// included. A floor deleted in the same change raises no note for its walls. Pure; values that do not parse are left
// to the save check.
import {
  bearingWarnings,
  CURRENT_SCHEMA_VERSION,
  engineerNoteFor,
  parseStoredObject,
  type ModelObject,
  type RuleChange,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Change, Objects } from '../model/patches';

function parse(id: string, v: ObjectValue | undefined | null): ModelObject | null {
  if (v === undefined || v === null) return null;
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  return r.ok ? r.object : null;
}

const RULE_TYPES: ReadonlySet<string> = new Set(['wall', 'opening', 'engineer_note']);

export function withBearingNotes(
  objects: Objects,
  changes: Change[],
  newId: () => string,
): Change[] {
  if (!changes.some((c) => RULE_TYPES.has((c.value ?? objects.get(c.id))?.type ?? '')))
    return changes;
  const byLower = new Map<string, string>();
  for (const id of objects.keys()) byLower.set(id.toLowerCase(), id);
  const before = new Map<string, ModelObject>();
  const take = (id: string) => {
    const k = id.toLowerCase();
    if (before.has(k)) return;
    const key = byLower.get(k);
    const o = key === undefined ? null : parse(key, objects.get(key));
    if (o !== null) before.set(k, o);
  };
  const rule: RuleChange[] = [];
  for (const c of changes) {
    const was = objects.get(byLower.get(c.id.toLowerCase()) ?? c.id);
    if (!RULE_TYPES.has((c.value ?? was)?.type ?? '')) continue;
    take(c.id);
    const after = parse(c.id, c.value);
    if (c.value !== null && after === null) continue;
    if (after?.type === 'opening' && after.data.geometry.hostWallId !== null)
      take(after.data.geometry.hostWallId);
    rule.push({ id: c.id, after });
  }
  // A floor deleted in the same change takes everything on it, its notes included, so it raises none.
  const goneFloors = new Set(
    changes.flatMap((c) =>
      c.value === null && objects.get(byLower.get(c.id.toLowerCase()) ?? c.id)?.type === 'floor'
        ? [c.id.toLowerCase()]
        : [],
    ),
  );
  const warnings = bearingWarnings(before, rule).filter(
    (w) => !goneFloors.has(w.level.toLowerCase()),
  );
  if (warnings.length === 0) return changes;
  return [
    ...changes,
    ...warnings.map((w): Change => ({
      id: newId(),
      value: {
        type: 'engineer_note',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: engineerNoteFor(w) as unknown as Record<string, unknown>,
      },
    })),
  ];
}
