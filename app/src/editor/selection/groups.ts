// EZD-233 (S03 Context menu "Group"; vault/build/assumptions.md EZD-233): a selection that takes any member of a
// group takes every member of it that is still in the model. Pure.
import type { Objects } from '../model/patches';

// `ids` first, in their order, then the members they bring, once each (ignoring case).
export function expandGroups(objects: Objects, ids: readonly string[]): string[] {
  if (ids.length === 0) return [];
  const present = new Map<string, string>();
  const groups: string[][] = [];
  for (const [id, v] of objects) {
    present.set(id.toLowerCase(), id);
    if (v.type !== 'group') continue;
    const m = v.data.memberIds;
    if (Array.isArray(m)) groups.push(m.filter((x): x is string => typeof x === 'string'));
  }
  if (groups.length === 0) return [...ids];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    const k = id.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(id);
  };
  ids.forEach(add);
  for (let i = 0; i < out.length; i += 1) {
    const k = out[i]!.toLowerCase();
    for (const g of groups) {
      if (!g.some((m) => m.toLowerCase() === k)) continue;
      for (const m of g) {
        const id = present.get(m.toLowerCase());
        if (id !== undefined) add(id);
      }
    }
  }
  return out;
}

// True when any of `ids` is a member of a group (the menu then offers Ungroup).
export function inAnyGroup(objects: Objects, ids: readonly string[]): boolean {
  const want = new Set(ids.map((id) => id.toLowerCase()));
  for (const v of objects.values()) {
    if (v.type !== 'group' || !Array.isArray(v.data.memberIds)) continue;
    if (v.data.memberIds.some((m) => typeof m === 'string' && want.has(m.toLowerCase())))
      return true;
  }
  return false;
}
