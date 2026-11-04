// EZD-101 T1 (vault/plans/EZD-101.md section 4): the permission catalog. Expected keys and group sizes are
// the plan's KEYS literal and Data section (S15 Permission list; AC-EZD-101-2; Q-0234).
import { describe, expect, it } from 'vitest';
import {
  isPermissionKey,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_PRESETS,
} from './catalog';

const KEYS = [
  'view_projects',
  'create_projects',
  'edit_model',
  'delete_projects',
  'upload_references',
  'add_markup',
  'run_code_check',
  'run_fast_renders',
  'run_standard_renders',
  'run_photoreal_renders',
  'approve_renders',
  'mark_client_ready',
  'see_company_costs',
  'see_sell_prices',
  'edit_catalog',
  'create_change_orders',
  'flag_to_supplier',
  'issue_permit_sets',
  'issue_revisions',
  'send_to_client',
  'export',
  'edit_field_tasks',
  'check_off_tasks',
  'photo_notes',
  'flag_conflict',
  'send_field_measurement',
  'approve_field_measurements',
  'settings_company',
  'settings_users',
  'settings_title_block',
  'settings_sheet_presets',
  'settings_defaults',
  'settings_catalog',
  'settings_render_models',
  'settings_code_edition',
  'settings_libraries',
  'settings_system_status',
];

describe('EZD-101 permission catalog', () => {
  it('T1 catalog: 37 keys in order, unique', () => {
    expect(KEYS).toHaveLength(37);
    expect(PERMISSIONS.map((p) => p.key)).toEqual(KEYS);
    expect([...PERMISSION_KEYS]).toEqual(KEYS);
    expect(new Set(PERMISSIONS.map((p) => p.key)).size).toBe(37);
  });

  it('T1 catalog: six groups in order with sizes 7, 5, 5, 4, 6, 10', () => {
    expect([...PERMISSION_GROUPS]).toEqual([
      'projects',
      'renders',
      'money',
      'issue_send',
      'field',
      'admin',
    ]);
    const sizes = PERMISSION_GROUPS.map((g) => PERMISSIONS.filter((p) => p.group === g).length);
    expect(sizes).toEqual([7, 5, 5, 4, 6, 10]);
    // Groups hold consecutive keys in KEYS order (Data: first 7, next 5, 5, 4, 6, last 10).
    expect(PERMISSIONS.map((p) => p.group)).toEqual(
      [7, 5, 5, 4, 6, 10].flatMap((n, i) => Array<string>(n).fill(PERMISSION_GROUPS[i])),
    );
    expect(PERMISSIONS.find((p) => p.key === 'export')?.group).toBe('issue_send');
  });

  it('T1 catalog: isPermissionKey', () => {
    expect(isPermissionKey('export')).toBe(true);
    expect(isPermissionKey('approve_translations')).toBe(false);
    expect(isPermissionKey('manage_users_and_settings')).toBe(false);
    expect(isPermissionKey(1)).toBe(false);
  });

  it('T1 catalog: role presets', () => {
    expect([...ROLE_PRESETS]).toEqual(['owner', 'designer', 'foreman', 'crew']);
  });
});
