// EZD-104 Build step 3 (vault/plans/EZD-104.md Decided "Switch count", "Modified", "No role", "Pill text and
// tone", "`formatLastActive`", "`formatUserDate`"; Q-0695; Q-0706): the Users page row types and the pure
// helpers shared by the browser and the server. No React, no Supabase. Calendar-day logic as
// app/src/lib/notifications/time.ts (EZD-110b).
import type { MessageParams } from '../messages/types';
import type { PermissionKey, RolePreset } from '../permissions/catalog';
import type { MessageKey } from '../../server/messages/catalog';

export const USER_PAGE_SIZE = 50;

// EZD-106: deactivated members are listed after the invited rows (09n Status bar row 1).
export type UserStatus = 'active' | 'invited' | 'deactivated';

export type UserRole = {
  id: string;
  name: string;
  preset: RolePreset | null;
  defaultPermissions: PermissionKey[];
};

export type UserRow = {
  membershipId: string;
  status: UserStatus;
  name: string | null;
  email: string;
  language: 'en' | 'es';
  role: UserRole | null;
  grantedKeys: PermissionKey[];
  lastActiveAt: string | null;
  invitedAt: string | null;
  canCopyLink: boolean;
};

export type UserCounts = { active: number; invited: number; en: number; es: number };

export type UserPage = UserCounts & {
  rows: UserRow[];
  // EZD-106: the company's roles for the inspector's Role select (presets, then custom roles by name).
  roles: UserRole[];
  total: number;
  page: number;
  pageSize: number;
};

export type RoleTone = 'owner' | 'designer' | 'foreman' | 'crew' | 'custom' | 'pending';

export function grantedCount(row: Pick<UserRow, 'grantedKeys'>): number {
  return row.grantedKeys.length;
}

export function isModified(row: Pick<UserRow, 'grantedKeys' | 'role'>): boolean {
  if (row.role === null) return false;
  const granted = new Set(row.grantedKeys);
  const defaults = new Set(row.role.defaultPermissions);
  if (granted.size !== defaults.size) return true;
  for (const key of granted) if (!defaults.has(key)) return true;
  return false;
}

export function roleTone(row: Pick<UserRow, 'status' | 'role'>): RoleTone | null {
  if (row.status === 'invited') return 'pending';
  if (row.role === null) return null;
  return row.role.preset ?? 'custom';
}

function dayParts(d: Date, timeZone: string | undefined): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

const plain = (s: string) => s.replace(new RegExp('[\\u202f\\u00a0]', 'g'), ' ');

export function formatUserDate(
  iso: string,
  now: Date,
  timeZone?: string,
): { key: MessageKey; params: MessageParams } {
  const at = new Date(iso);
  const date = plain(
    new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(at),
  );
  const a = dayParts(at, timeZone);
  const n = dayParts(now, timeZone);
  if (a.y === n.y) return { key: 'office.users.date', params: { date } };
  return { key: 'office.users.date_year', params: { date, year: String(a.y) } };
}

export function formatLastActive(
  lastActiveAt: string | null,
  now: Date,
  timeZone?: string,
): { key: MessageKey; params?: MessageParams } {
  if (lastActiveAt === null) return { key: 'office.users.last_active.never' };
  const at = new Date(lastActiveAt);
  const diff = now.getTime() - at.getTime();
  if (diff < 60_000) return { key: 'office.users.last_active.now' };
  if (diff < 3_600_000)
    return {
      key: 'office.users.last_active.minutes_ago',
      params: { count: Math.floor(diff / 60_000) },
    };
  const a = dayParts(at, timeZone);
  const n = dayParts(now, timeZone);
  if (a.y === n.y && a.m === n.m && a.d === n.d)
    return {
      key: 'office.users.last_active.hours_ago',
      params: { count: Math.floor(diff / 3_600_000) },
    };
  const prev = new Date(Date.UTC(n.y, n.m - 1, n.d - 1));
  if (a.y === prev.getUTCFullYear() && a.m === prev.getUTCMonth() + 1 && a.d === prev.getUTCDate())
    return { key: 'office.users.last_active.yesterday' };
  return formatUserDate(lastActiveAt, now, timeZone);
}
