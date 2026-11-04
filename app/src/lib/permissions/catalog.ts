// EZD-101 Step 9 (vault/plans/EZD-101.md): the 37 permission keys in the order of the SQL literal KEYS
// (private.permission_keys()), with their groups (S15 Permission list; Q-0210; Q-0225; Q-0234). Imported by
// browser and server.
export const PERMISSION_GROUPS = [
  'projects',
  'renders',
  'money',
  'issue_send',
  'field',
  'admin',
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

export const PERMISSIONS = [
  { key: 'view_projects', group: 'projects' },
  { key: 'create_projects', group: 'projects' },
  { key: 'edit_model', group: 'projects' },
  { key: 'delete_projects', group: 'projects' },
  { key: 'upload_references', group: 'projects' },
  { key: 'add_markup', group: 'projects' },
  { key: 'run_code_check', group: 'projects' },
  { key: 'run_fast_renders', group: 'renders' },
  { key: 'run_standard_renders', group: 'renders' },
  { key: 'run_photoreal_renders', group: 'renders' },
  { key: 'approve_renders', group: 'renders' },
  { key: 'mark_client_ready', group: 'renders' },
  { key: 'see_company_costs', group: 'money' },
  { key: 'see_sell_prices', group: 'money' },
  { key: 'edit_catalog', group: 'money' },
  { key: 'create_change_orders', group: 'money' },
  { key: 'flag_to_supplier', group: 'money' },
  { key: 'issue_permit_sets', group: 'issue_send' },
  { key: 'issue_revisions', group: 'issue_send' },
  { key: 'send_to_client', group: 'issue_send' },
  { key: 'export', group: 'issue_send' },
  { key: 'edit_field_tasks', group: 'field' },
  { key: 'check_off_tasks', group: 'field' },
  { key: 'photo_notes', group: 'field' },
  { key: 'flag_conflict', group: 'field' },
  { key: 'send_field_measurement', group: 'field' },
  { key: 'approve_field_measurements', group: 'field' },
  { key: 'settings_company', group: 'admin' },
  { key: 'settings_users', group: 'admin' },
  { key: 'settings_title_block', group: 'admin' },
  { key: 'settings_sheet_presets', group: 'admin' },
  { key: 'settings_defaults', group: 'admin' },
  { key: 'settings_catalog', group: 'admin' },
  { key: 'settings_render_models', group: 'admin' },
  { key: 'settings_code_edition', group: 'admin' },
  { key: 'settings_libraries', group: 'admin' },
  { key: 'settings_system_status', group: 'admin' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

const KEY_SET: ReadonlySet<unknown> = new Set(PERMISSION_KEYS);

export function isPermissionKey(value: unknown): value is PermissionKey {
  return KEY_SET.has(value);
}

export const ROLE_PRESETS = ['owner', 'designer', 'foreman', 'crew'] as const;

export type RolePreset = (typeof ROLE_PRESETS)[number];
