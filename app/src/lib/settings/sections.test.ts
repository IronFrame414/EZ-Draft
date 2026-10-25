// EZD-103a U1, U2 (vault/plans/EZD-103a.md sections 3, 4; AC-EZD-103-1, AC-EZD-103-2).
// Expected values: plan Decided "Sections" (Q-0210, Q-0225, Q-0228, Q-0234; B15x), Decided "Initials"
// (B15 "JB"), the preset arrays of supabase/migrations/20261024100001_create_permission_catalog.sql
// (AC-EZD-101-3; Q-0223).
import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../permissions/catalog';
import { en } from '../../server/messages/catalogs/en';
import { initialsFor } from '../users/initials';
import {
  SETTINGS_SECTIONS,
  allowedSections,
  sectionBySlug,
  sectionForPath,
  settingsHref,
} from './sections';

const E = en as unknown as Record<string, unknown>;

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
const DESIGNER: PermissionKey[] = [
  'view_projects',
  'create_projects',
  'edit_model',
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
  'send_to_client',
  'export',
  'edit_field_tasks',
  'check_off_tasks',
  'photo_notes',
  'flag_conflict',
  'send_field_measurement',
  'approve_field_measurements',
  'settings_catalog',
  'settings_libraries',
];
const CREW: PermissionKey[] = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];

const ALL = [
  'company',
  'users',
  'title_block',
  'sheet_presets',
  'defaults',
  'catalog',
  'render_models',
  'code_edition',
  'libraries',
  'system_status',
];

const DOT = '·';
// [id, slug, permission, en label, en location, icon, badge], Decided "Sections".
const ROWS = [
  ['company', 'company', 'settings_company', 'Company', `Settings ${DOT} Company`, 'domain', null],
  [
    'users',
    'users',
    'settings_users',
    'Users + permissions',
    `Settings ${DOT} Users`,
    'group',
    'users',
  ],
  [
    'title_block',
    'title-block',
    'settings_title_block',
    'Title block',
    `Settings ${DOT} Title block`,
    'view_quilt',
    null,
  ],
  [
    'sheet_presets',
    'sheet-presets',
    'settings_sheet_presets',
    'Sheet presets',
    `Settings ${DOT} Sheet presets`,
    'description',
    null,
  ],
  [
    'defaults',
    'defaults',
    'settings_defaults',
    'Defaults',
    `Settings ${DOT} Defaults`,
    'tune',
    'units',
  ],
  [
    'catalog',
    'catalog',
    'settings_catalog',
    'Catalog',
    `Settings ${DOT} Catalog`,
    'inventory_2',
    null,
  ],
  [
    'render_models',
    'render-models',
    'settings_render_models',
    'Render models',
    `Settings ${DOT} Render models`,
    'auto_awesome',
    null,
  ],
  [
    'code_edition',
    'code-edition',
    'settings_code_edition',
    'Code edition',
    `Settings ${DOT} Code edition`,
    'gavel',
    null,
  ],
  [
    'libraries',
    'libraries',
    'settings_libraries',
    'Libraries',
    `Settings ${DOT} Libraries`,
    'library_books',
    null,
  ],
  [
    'system_status',
    'system-status',
    'settings_system_status',
    'System status',
    `Settings ${DOT} System status`,
    'monitor_heart',
    null,
  ],
];

const allowedIds = (keys: readonly PermissionKey[]) => {
  const on = new Set<PermissionKey>(keys);
  return allowedSections((p) => on.has(p)).map((s) => s.id);
};

describe('EZD-103a settings sections', () => {
  it('U1 sections: the 10 rows of Decided "Sections" in order, no Translations or Billing', () => {
    const mapped = SETTINGS_SECTIONS.map((s) => [
      s.id,
      s.slug,
      s.permission,
      E[s.label],
      E[s.location],
      s.icon,
      s.badge,
    ]);
    expect(mapped).toEqual(ROWS);
    for (const s of SETTINGS_SECTIONS) {
      for (const v of [s.id, s.slug, String(E[s.label])]) {
        expect(v.toLowerCase(), v).not.toContain('translat');
        expect(v.toLowerCase(), v).not.toContain('billing');
      }
    }
  });

  it('U2 helpers: href, slug and path lookup, nav filtering, initials', () => {
    const users = SETTINGS_SECTIONS.find((s) => s.id === 'users');
    expect(users).toBeDefined();
    expect(settingsHref(users!)).toBe('/settings/users');

    expect(sectionBySlug('title-block')?.id).toBe('title_block');
    expect(sectionBySlug('translations')).toBeNull();
    expect(sectionBySlug('billing')).toBeNull();

    expect(sectionForPath('/settings/users')?.id).toBe('users');
    expect(sectionForPath('/settings/users/x')?.id).toBe('users');
    expect(sectionForPath('/settings')).toBeNull();
    expect(sectionForPath('/settingsx/users')).toBeNull();
    expect(sectionForPath(null)).toBeNull();

    expect(allowedIds(FOREMAN)).toEqual(['libraries']);
    expect(allowedIds(DESIGNER)).toEqual(['catalog', 'libraries']);
    expect(allowedIds(CREW)).toEqual([]);
    expect(allowedIds(PERMISSION_KEYS)).toEqual(ALL);

    expect(initialsFor('Josh Bishop', 'josh@example.com')).toBe('JB');
    expect(initialsFor(' ana  maria lopez ', 'a@x.test')).toBe('AL');
    expect(initialsFor('cher', 'c@x.test')).toBe('C');
    expect(initialsFor(null, 'josh@example.com')).toBe('J');
    expect(initialsFor('', 'z@x.test')).toBe('Z');
    expect(initialsFor('élan vital', 'e@x.test')).toBe('ÉV');
  });
});
