// EZD-106 (vault/plans/EZD-106.md Part b; S15 Role select, Permission switch, Group header count, Permissions
// counter, Unsaved indicator, Reset to role; 09n "Switch counts"; Q-0695 decisions 03 row 35, 05 row 141;
// Q-0725 (a)): the inspector's draft and its counts. No React, no fetch.
import {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSIONS,
  type PermissionGroup,
  type PermissionKey,
} from '../permissions/catalog';
import type { UserRole, UserRow } from './users';

export type InspectorDraft = {
  roleId: string | null;
  language: 'en' | 'es';
  // Kept in catalog order, so equal sets compare equal.
  granted: PermissionKey[];
};

const inCatalogOrder = (keys: Iterable<PermissionKey>): PermissionKey[] => {
  const on = new Set(keys);
  return PERMISSION_KEYS.filter((k) => on.has(k));
};

export function draftOf(row: UserRow): InspectorDraft {
  return {
    roleId: row.role?.id ?? null,
    language: row.language,
    granted: inCatalogOrder(row.grantedKeys),
  };
}

// Choosing a role re-ticks all 37 switches to its defaults (S15 Role select).
export function chooseRole(draft: InspectorDraft, role: UserRole): InspectorDraft {
  return { ...draft, roleId: role.id, granted: inCatalogOrder(role.defaultPermissions) };
}

// Reset re-ticks to the selected role's definition; nothing is saved (S15 Reset to role).
export function resetToRole(draft: InspectorDraft, role: UserRole | null): InspectorDraft {
  if (role === null) return draft;
  return { ...draft, granted: inCatalogOrder(role.defaultPermissions) };
}

export function toggleSwitch(draft: InspectorDraft, key: PermissionKey): InspectorDraft {
  const on = new Set(draft.granted);
  if (on.has(key)) on.delete(key);
  else on.add(key);
  return { ...draft, granted: inCatalogOrder(on) };
}

// "(modified)": the granted set differs from the role's defaults (Q-0695 decisions 03 row 35).
export function draftModified(draft: InspectorDraft, role: UserRole | null): boolean {
  if (role === null) return false;
  const defaults = inCatalogOrder(role.defaultPermissions);
  return (
    defaults.length !== draft.granted.length || defaults.some((k, i) => draft.granted[i] !== k)
  );
}

export type GroupCount = { group: PermissionGroup; granted: number; total: number };

// "n of m" per group, in catalog.ts group order (09n Switch counts row 4).
export function groupCounts(granted: readonly PermissionKey[]): GroupCount[] {
  const on = new Set(granted);
  return PERMISSION_GROUPS.map((group) => {
    const keys = PERMISSIONS.filter((p) => p.group === group);
    return { group, granted: keys.filter((p) => on.has(p.key)).length, total: keys.length };
  });
}

// The footer's n (Q-0725 (a)): each switch that differs from the saved state, plus 1 for a role change and 1
// for a language change.
export function pendingEdits(saved: InspectorDraft, draft: InspectorDraft): number {
  const a = new Set(saved.granted);
  const b = new Set(draft.granted);
  let n = 0;
  for (const k of PERMISSION_KEYS) if (a.has(k) !== b.has(k)) n += 1;
  if (saved.roleId !== draft.roleId) n += 1;
  if (saved.language !== draft.language) n += 1;
  return n;
}
