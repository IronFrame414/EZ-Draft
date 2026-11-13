// EZD-106 (vault/plans/EZD-106.md Part a; S15 Controls, More menu, Validation; Q-0695 decisions 10 rows 59, 60,
// 62): server-only helpers for the Users page member writes. Each write is one definer function under the
// caller's session (supabase/migrations/20261113120001_create_member_write_functions.sql); this file parses the
// request, calls it and maps its refusals to HTTP answers. Events are emitted by the routes after the
// function's transaction has committed.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  isPermissionKey,
  PERMISSION_KEYS,
  type PermissionKey,
} from '../../lib/permissions/catalog';
import type { Database } from '../db/database.types';

export type SaveMemberInput = {
  roleId: string;
  language: 'en' | 'es';
  grantedKeys: PermissionKey[];
};

// The full granted set: at most one entry per catalog key (37), each a catalog key; duplicates refused.
const saveSchema = z
  .object({
    roleId: z.uuid(),
    language: z.enum(['en', 'es']),
    grantedKeys: z.array(z.string()).max(PERMISSION_KEYS.length),
  })
  .strict();

export function parseSaveMemberInput(raw: unknown): SaveMemberInput | null {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { roleId, language, grantedKeys } = parsed.data;
  if (!grantedKeys.every((k) => isPermissionKey(k))) return null;
  if (new Set(grantedKeys).size !== grantedKeys.length) return null;
  return { roleId, language, grantedKeys: grantedKeys as PermissionKey[] };
}

export function isMembershipId(id: string): boolean {
  return z.uuid().safeParse(id).success;
}

export type MemberRefusal = { status: number; code: string };

export type SaveMemberResult = {
  membershipId: string;
  appUserId: string;
  tenantId: string;
  changedKeys: PermissionKey[];
  roleChanged: boolean;
  roleId: string;
  languageChanged: boolean;
  language: 'en' | 'es';
};

export type MemberActionResult = { membershipId: string; appUserId: string; tenantId: string };

type DbError = { code?: string; message?: string };

// The function's refusals (architecture "Errors and logging": a known refusal is a 4xx with its own code;
// anything else is thrown to the route's 500).
export function memberRefusal(error: DbError): MemberRefusal | null {
  const message = error.message ?? '';
  switch (error.code) {
    case '42501':
      return { status: 403, code: 'permission_denied' };
    case 'P0002':
      return { status: 404, code: 'member_not_found' };
    case '22023':
      return message === 'member_state'
        ? { status: 409, code: 'member_state' }
        : { status: 400, code: 'invalid_input' };
    case 'P0001':
      if (message === 'last_settings_users_holder') return { status: 409, code: message };
      if (message === 'active_elsewhere') return { status: 409, code: message };
      return null;
    default:
      return null;
  }
}

const saveResult = z.object({
  membershipId: z.string(),
  appUserId: z.string(),
  tenantId: z.string(),
  changedKeys: z.array(z.string()),
  roleChanged: z.boolean(),
  roleId: z.string(),
  languageChanged: z.boolean(),
  language: z.enum(['en', 'es']),
});
const actionResult = z.object({
  membershipId: z.string(),
  appUserId: z.string(),
  tenantId: z.string(),
});

export async function saveMember(
  client: SupabaseClient<Database>,
  membershipId: string,
  input: SaveMemberInput,
): Promise<{ ok: true; value: SaveMemberResult } | { ok: false; refusal: MemberRefusal }> {
  const { data, error } = await client.rpc('save_member', {
    p_membership_id: membershipId,
    p_role_id: input.roleId,
    p_language: input.language,
    p_granted: input.grantedKeys,
  });
  if (error) {
    const refusal = memberRefusal(error);
    if (refusal) return { ok: false, refusal };
    throw error;
  }
  const parsed = saveResult.safeParse(data);
  if (!parsed.success) throw new Error('save_member_bad_result');
  return {
    ok: true,
    value: { ...parsed.data, changedKeys: parsed.data.changedKeys.filter(isPermissionKey) },
  };
}

export type MemberAction = 'deactivate_member' | 'reactivate_member' | 'remove_member';

export async function memberAction(
  client: SupabaseClient<Database>,
  fn: MemberAction,
  membershipId: string,
): Promise<{ ok: true; value: MemberActionResult } | { ok: false; refusal: MemberRefusal }> {
  const { data, error } = await client.rpc(fn, { p_membership_id: membershipId });
  if (error) {
    const refusal = memberRefusal(error);
    if (refusal) return { ok: false, refusal };
    throw error;
  }
  const parsed = actionResult.safeParse(data);
  if (!parsed.success) throw new Error(`${fn}_bad_result`);
  return { ok: true, value: parsed.data };
}
