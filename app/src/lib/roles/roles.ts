// EZD-107 (S15 Role card, New role, Save as new role, Validation; board S15k; Q-0695 decisions 03 row 35): the
// role types and pure helpers shared by the browser and the server. No React, no Supabase.
import { PERMISSION_KEYS, type PermissionKey, type RolePreset } from '../permissions/catalog';

// The app's name bound (PROJECT_NAME_MAX, customers, company); the database checks the same.
export const ROLE_NAME_MAX = 1000;

export type RoleSummary = {
  id: string;
  name: string;
  preset: RolePreset | null;
  defaultPermissions: PermissionKey[];
  // Memberships of any status that hold the role (Delete only at 0).
  holders: number;
};

export const inCatalogOrder = (keys: Iterable<PermissionKey>): PermissionKey[] => {
  const on = new Set(keys);
  return PERMISSION_KEYS.filter((k) => on.has(k));
};

export type RoleNameProblem = 'blank' | 'taken';

// S15 Validation: a name is required and unique in the company, ignoring case and outer spaces. `selfId` is the
// role being edited, whose own name never counts as taken.
export function checkRoleName(
  name: string,
  roles: readonly Pick<RoleSummary, 'id' | 'name'>[],
  selfId: string | null = null,
): RoleNameProblem | null {
  const n = name.trim().toLowerCase();
  if (n === '') return 'blank';
  if (roles.some((r) => r.id !== selfId && r.name.trim().toLowerCase() === n)) return 'taken';
  return null;
}

// The role name that already uses `name` (the refusal names it as stored, board S15k W20).
export function takenBy(
  name: string,
  roles: readonly Pick<RoleSummary, 'id' | 'name'>[],
  selfId: string | null = null,
): string | null {
  const n = name.trim().toLowerCase();
  return roles.find((r) => r.id !== selfId && r.name.trim().toLowerCase() === n)?.name ?? null;
}

// New role "Start from" (S15 New role; board S15k W15): nothing ticked, or a preset's defaults.
export function startFrom(preset: Pick<RoleSummary, 'defaultPermissions'> | null): PermissionKey[] {
  return preset === null ? [] : inCatalogOrder(preset.defaultPermissions);
}

export type RoleDraft = { name: string; granted: PermissionKey[] };

export function toggleKey(granted: readonly PermissionKey[], key: PermissionKey): PermissionKey[] {
  const on = new Set(granted);
  if (on.has(key)) on.delete(key);
  else on.add(key);
  return inCatalogOrder(on);
}

// The role panel's "Unsaved: n changes": each switch that differs, plus 1 for a name change.
export function roleEdits(saved: RoleDraft, draft: RoleDraft): number {
  const a = new Set(saved.granted);
  const b = new Set(draft.granted);
  let n = 0;
  for (const k of PERMISSION_KEYS) if (a.has(k) !== b.has(k)) n += 1;
  if (saved.name.trim() !== draft.name.trim()) n += 1;
  return n;
}

// Presets first in S15 order, then custom roles by name (S15 Role select; board S15k "presets first").
export function splitRoles<T extends Pick<RoleSummary, 'preset'>>(
  roles: readonly T[],
): { presets: T[]; custom: T[] } {
  return {
    presets: roles.filter((r) => r.preset !== null),
    custom: roles.filter((r) => r.preset === null),
  };
}
