// EZD-107 pure helpers (AC-EZD-107-2). Expected values: S15 Validation and board S15k "Name refused" (a blank
// name refused; a used name refused ignoring case, so "foreman" matches Foreman), S15 New role (start from
// nothing or a preset; 09n Switch counts: Foreman 11, Crew 4), catalog.ts order, the panel's unsaved count
// (each differing switch plus the name, as the inspector's Q-0725 (a) count).
import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../permissions/catalog';
import {
  checkRoleName,
  roleEdits,
  splitRoles,
  startFrom,
  takenBy,
  toggleKey,
  type RoleSummary,
} from './roles';

// The Foreman preset (20261024100001 private.preset_permissions('foreman'); 09n: 11).
const FOREMAN: PermissionKey[] = [
  'view_projects',
  'create_projects',
  'add_markup',
  'run_fast_renders',
  'export',
  'edit_field_tasks',
  'check_off_tasks',
  'photo_notes',
  'flag_conflict',
  'send_field_measurement',
  'settings_libraries',
];

const role = (id: string, name: string, preset: RoleSummary['preset'] = null): RoleSummary => ({
  id,
  name,
  preset,
  defaultPermissions: [],
  holders: 0,
});

const ROLES = [
  role('o', 'Owner', 'owner'),
  role('f', 'Foreman', 'foreman'),
  role('c', 'Lead carpenter'),
];

describe('EZD-107 role helpers', () => {
  it('checkRoleName: blank refused; a used name refused ignoring case and spaces; own name allowed', () => {
    expect(checkRoleName('', ROLES)).toBe('blank');
    expect(checkRoleName('   ', ROLES)).toBe('blank');
    expect(checkRoleName('foreman', ROLES)).toBe('taken');
    expect(checkRoleName('  LEAD CARPENTER ', ROLES)).toBe('taken');
    expect(checkRoleName('Lead carpenter', ROLES, 'c')).toBeNull();
    expect(checkRoleName('Office manager', ROLES)).toBeNull();
    expect(takenBy('foreman', ROLES)).toBe('Foreman');
    expect(takenBy('Office manager', ROLES)).toBeNull();
  });

  it('startFrom: nothing ticks 0; a preset ticks its defaults in catalog order', () => {
    expect(startFrom(null)).toEqual([]);
    const fromForeman = startFrom({ defaultPermissions: [...FOREMAN].reverse() });
    expect(fromForeman).toHaveLength(11);
    expect(fromForeman).toEqual(PERMISSION_KEYS.filter((k) => FOREMAN.includes(k)));
  });

  it('roleEdits counts each differing switch and a name change; toggleKey keeps catalog order', () => {
    const saved = { name: 'Lead carpenter', granted: FOREMAN };
    expect(roleEdits(saved, { name: ' Lead carpenter ', granted: [...FOREMAN] })).toBe(0);
    const off = toggleKey(FOREMAN, 'export');
    expect(off).toHaveLength(10);
    expect(roleEdits(saved, { name: 'Lead carpenter', granted: off })).toBe(1);
    const on = toggleKey(off, 'see_company_costs');
    expect(roleEdits(saved, { name: 'Site lead', granted: on })).toBe(3);
    expect(on).toEqual(PERMISSION_KEYS.filter((k) => on.includes(k)));
  });

  it('splitRoles: presets first, then custom roles', () => {
    const { presets, custom } = splitRoles(ROLES);
    expect(presets.map((r) => r.name)).toEqual(['Owner', 'Foreman']);
    expect(custom.map((r) => r.name)).toEqual(['Lead carpenter']);
  });
});
