// EZD-104 U1-U3 (vault/plans/EZD-104.md section 4; AC-EZD-104-2, -3, -7). Expected values: U1/U2 from Q-0706
// and 09n rows 3-7 (Now under 60 s, N min ago under an hour, N hr ago the same calendar day, Yesterday the
// previous calendar day, then a date; the minutes rule comes before the day rule); formatUserDate from plan
// Decided "formatUserDate"; U3 counts, "modified" and tones from 09n "Switch counts" rows 1-3, Q-0695 (03 row
// 35) and Decided "No role", "Pill text and tone". Preset arrays are copied from
// supabase/migrations/20261024100001_create_permission_catalog.sql:22-31.
import { describe, expect, it } from 'vitest';
import { PERMISSION_KEYS, type PermissionKey } from '../permissions/catalog';
import {
  formatLastActive,
  formatUserDate,
  grantedCount,
  isModified,
  roleTone,
  USER_PAGE_SIZE,
  type UserRow,
} from './users';

const NOW = new Date('2026-11-11T14:00:00Z');
const TZ = 'America/New_York';
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

describe('EZD-104 users formatting', () => {
  it('U1 formatLastActive: now, minutes, hours, never', () => {
    expect(USER_PAGE_SIZE).toBe(50);
    expect(formatLastActive(ago(0), NOW, TZ).key).toBe('office.users.last_active.now');
    expect(formatLastActive(ago(59 * SEC), NOW, TZ).key).toBe('office.users.last_active.now');
    expect(formatLastActive(ago(-30 * SEC), NOW, TZ).key).toBe('office.users.last_active.now');

    const at = (ms: number) => formatLastActive(ago(ms), NOW, TZ);
    expect(at(60 * SEC)).toMatchObject({
      key: 'office.users.last_active.minutes_ago',
      params: { count: 1 },
    });
    expect(at(12 * MIN)).toMatchObject({
      key: 'office.users.last_active.minutes_ago',
      params: { count: 12 },
    });
    expect(at(59 * MIN + 59 * SEC)).toMatchObject({
      key: 'office.users.last_active.minutes_ago',
      params: { count: 59 },
    });

    expect(at(60 * MIN)).toMatchObject({
      key: 'office.users.last_active.hours_ago',
      params: { count: 1 },
    });
    expect(at(8 * HOUR)).toMatchObject({
      key: 'office.users.last_active.hours_ago',
      params: { count: 8 },
    });

    expect(formatLastActive(null, NOW, TZ).key).toBe('office.users.last_active.never');

    // 00:30 local on 11 Nov; 23:50 local on 10 Nov is 40 minutes earlier: the minutes rule comes first.
    const now2 = new Date('2026-11-11T05:30:00Z');
    expect(formatLastActive('2026-11-11T04:50:00Z', now2, TZ)).toMatchObject({
      key: 'office.users.last_active.minutes_ago',
      params: { count: 40 },
    });
  });

  it('U2 formatLastActive: yesterday and dates; formatUserDate', () => {
    expect(formatLastActive('2026-11-11T04:30:00Z', NOW, TZ).key).toBe(
      'office.users.last_active.yesterday',
    );
    expect(formatLastActive('2026-11-10T12:00:00Z', NOW, TZ).key).toBe(
      'office.users.last_active.yesterday',
    );
    expect(formatLastActive('2026-10-02T13:00:00Z', NOW, TZ)).toEqual({
      key: 'office.users.date',
      params: { date: 'Oct 2' },
    });
    expect(formatLastActive('2025-12-20T17:00:00Z', NOW, TZ)).toEqual({
      key: 'office.users.date_year',
      params: { date: 'Dec 20', year: '2025' },
    });
    expect(formatUserDate('2026-10-09T16:00:00Z', NOW, TZ)).toEqual({
      key: 'office.users.date',
      params: { date: 'Oct 9' },
    });
  });
});

const OWNER: PermissionKey[] = [...PERMISSION_KEYS];
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
const CREW: PermissionKey[] = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];

type Role = NonNullable<UserRow['role']>;
const role = (name: string, preset: Role['preset'], defaultPermissions: PermissionKey[]): Role => ({
  name,
  preset,
  defaultPermissions,
});
const row = (
  status: UserRow['status'],
  r: UserRow['role'],
  grantedKeys: PermissionKey[],
): UserRow => ({
  membershipId: 'm',
  status,
  name: null,
  email: 'x@example.test',
  language: 'en',
  role: r,
  grantedKeys,
  lastActiveAt: null,
  invitedAt: null,
  canCopyLink: false,
});

describe('EZD-104 users row helpers', () => {
  it('U3 grantedCount, isModified, roleTone', () => {
    const rows: UserRow[] = [
      row('active', role('Owner', 'owner', OWNER), OWNER),
      row('active', role('Crew', 'crew', CREW), CREW),
      row('active', role('Foreman', 'foreman', FOREMAN), [...FOREMAN, 'see_company_costs']),
      row(
        'active',
        role('Foreman', 'foreman', FOREMAN),
        FOREMAN.filter((k) => k !== 'export'),
      ),
      row('active', role('Office lead', null, ['view_projects', 'export', 'settings_users']), [
        'settings_users',
        'view_projects',
        'export',
      ]),
      row('active', null, ['view_projects', 'export', 'photo_notes']),
      row('invited', role('Crew', 'crew', CREW), CREW),
    ];
    expect(rows.map(grantedCount)).toEqual([37, 4, 12, 10, 3, 3, 4]);
    expect(rows.map(isModified)).toEqual([false, false, true, true, false, false, false]);
    expect(rows.map(roleTone)).toEqual([
      'owner',
      'crew',
      'foreman',
      'foreman',
      'custom',
      null,
      'pending',
    ]);
    // The Designer preset is part of the tone list (Decided "Pill text and tone").
    expect(roleTone(row('active', role('Designer', 'designer', DESIGNER), DESIGNER))).toBe(
      'designer',
    );
  });
});
