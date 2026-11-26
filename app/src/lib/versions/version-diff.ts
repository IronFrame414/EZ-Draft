// EZD-139 (Q-0220; Q-0700 05 "Visual diff"; 09p Visual diff; AC-EZD-139-2, -3): an old version against a newer
// document, by object id. Same id with different data is changed; in the old version only is removed since; in the
// newer one only is added since. It reads both maps and changes neither. EZD-123 moved it here from
// app/src/editor/versions/version-diff.ts (which re-exports it), so the cleanup route counts a version against its
// parent the same way (Q-0700 05 change summary).
import type { ObjectValue } from '../outbox/model-api';

// Object ids compare without case, as the editor's idKey (app/src/editor/shared/ids.ts).
const idKey = (id: string): string => id.toLowerCase();

type Objects = ReadonlyMap<string, ObjectValue>;

export type VersionDiff = {
  readonly changed: readonly string[];
  readonly removed: readonly string[];
  readonly added: readonly string[];
};

export const NO_DIFF: VersionDiff = Object.freeze({
  changed: Object.freeze([]) as readonly string[],
  removed: Object.freeze([]) as readonly string[],
  added: Object.freeze([]) as readonly string[],
});

// Deep equality of stored values; object key order does not count.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => same(v, bb[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(rb, k) && same(ra[k], rb[k]));
}

export function sameObject(a: ObjectValue, b: ObjectValue): boolean {
  return a.type === b.type && a.schemaVersion === b.schemaVersion && same(a.data, b.data);
}

// Ids are listed as the old version spells them (changed, removed) or as the working copy does (added).
export function versionDiff(old: Objects, working: Objects): VersionDiff {
  const work = new Map<string, ObjectValue>();
  for (const [id, v] of working) work.set(idKey(id), v);
  const oldIds = new Set<string>();
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [id, v] of old) {
    oldIds.add(idKey(id));
    const w = work.get(idKey(id));
    if (w === undefined) removed.push(id);
    else if (!sameObject(v, w)) changed.push(id);
  }
  const added: string[] = [];
  for (const id of working.keys()) if (!oldIds.has(idKey(id))) added.push(id);
  return { changed, removed, added };
}
