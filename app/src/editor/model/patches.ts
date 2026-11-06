// EZD-120b Build step 7 (vault/plans/EZD-120b.md section 3 patches row; Decided "Patch", "Changed ids"; 11 rule
// 1; 03b rule 4): an edit as before and after values per object, applied either way. Pure; a new map each time,
// every value the edit does not touch keeps its identity.
import type { ObjectValue } from '../../lib/outbox/model-api';

// A null value is a delete.
export type Change = { id: string; value: ObjectValue | null };

export type Objects = ReadonlyMap<string, ObjectValue>;

// A null `before` is an add; a null `after` is a remove.
export type Patch = { id: string; before: ObjectValue | null; after: ObjectValue | null };

export type Edit = { patches: Patch[] };

export function makeEdit(objects: Objects, changes: Change[]): Edit {
  const seen = new Set<string>();
  for (const c of changes) {
    if (seen.has(c.id)) throw new Error('duplicate_object_id');
    seen.add(c.id);
  }
  return {
    patches: changes.map((c) => ({ id: c.id, before: objects.get(c.id) ?? null, after: c.value })),
  };
}

export function applyEditTo(
  objects: Objects,
  edit: Edit,
  direction: 'forward' | 'back',
): Map<string, ObjectValue> {
  const next = new Map(objects);
  for (const p of edit.patches) {
    const value = direction === 'forward' ? p.after : p.before;
    if (value === null) next.delete(p.id);
    else next.set(p.id, value);
  }
  return next;
}
