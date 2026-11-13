// EZD-104 Build step 4 (vault/plans/EZD-104.md Decided "Search bound", "Page bound", "`listUsers`", "Touch
// call"; Q-0695 03-data-model row 34): server-only helpers for the Users page. Reads go through the caller's
// session client (RLS: the claim tenant). The last-active touch never fails the request.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { isPermissionKey, ROLE_PRESETS, type PermissionKey } from '../../lib/permissions/catalog';
import { USER_PAGE_SIZE, type UserPage } from '../../lib/users/users';
import type { Database } from '../db/database.types';
import { reportError } from '../errors/report';

export type UsersQuery = { q: string; page: number };

const PAGE_PATTERN = /^[1-9][0-9]{0,5}$/;

export function parseUsersQuery(params: URLSearchParams): UsersQuery | null {
  const q = (params.get('q') ?? '').trim();
  if (q.length > 1000) return null;
  const pageRaw = params.get('page');
  let page = 1;
  if (pageRaw !== null) {
    if (!PAGE_PATTERN.test(pageRaw)) return null;
    page = Number(pageRaw);
  }
  return { q, page };
}

const keys = z
  .array(z.string())
  .transform((list) => list.filter((k): k is PermissionKey => isPermissionKey(k)));
const count = z.number().int().nonnegative();
const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  preset: z.enum(ROLE_PRESETS).nullable(),
  defaultPermissions: keys,
});
const rowSchema = z.object({
  membershipId: z.string(),
  status: z.enum(['active', 'invited', 'deactivated']),
  name: z.string().nullable(),
  email: z.string(),
  language: z.enum(['en', 'es']),
  role: roleSchema.nullable(),
  grantedKeys: keys,
  lastActiveAt: z.string().nullable(),
  invitedAt: z.string().nullable(),
  canCopyLink: z.boolean(),
});
const listSchema = z.object({
  rows: z.array(rowSchema),
  roles: z.array(roleSchema),
  total: count,
  active: count,
  invited: count,
  en: count,
  es: count,
});

export async function listUsers(
  client: SupabaseClient<Database>,
  query: UsersQuery,
): Promise<UserPage> {
  const { data, error } = await client.rpc('list_users', {
    p_search: query.q,
    p_page: query.page,
  });
  if (error) throw error;
  const parsed = listSchema.safeParse(data);
  if (!parsed.success) throw new Error('list_users_bad_result');
  const { rows, roles, total, active, invited, en, es } = parsed.data;
  return {
    active,
    invited,
    en,
    es,
    rows,
    roles,
    total,
    page: query.page,
    pageSize: USER_PAGE_SIZE,
  };
}

const TOUCH_FAILED = 'last_active_touch_failed';

export async function touchLastActive(client: SupabaseClient<Database>): Promise<void> {
  let failed: boolean;
  try {
    const { error } = await client.rpc('touch_last_active');
    // 42501: an ended session or no gate; nothing to move.
    failed = error ? error.code !== '42501' : false;
  } catch {
    failed = true;
  }
  if (!failed) return;
  try {
    await reportError(new Error(TOUCH_FAILED), {
      source: 'function',
      location: 'permissions.last_active',
      alert: false,
    });
  } catch {
    // Never fails the request (Q-0695, 03-data-model row 34).
  }
}
