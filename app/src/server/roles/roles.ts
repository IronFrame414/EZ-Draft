// EZD-107 (S15 Role card, New role, Validation, Events; Q-0695 decisions 03 row 35, 10 row 59): server-only
// helpers for the custom role routes. Each write is one definer function under the caller's session
// (supabase/migrations/20261113130000_create_role_functions.sql); this file parses the request body, calls the
// function and maps its refusals to HTTP answers (architecture "Errors and logging").
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ROLE_NAME_MAX, type RoleSummary } from '../../lib/roles/roles';
import {
  isPermissionKey,
  PERMISSION_KEYS,
  ROLE_PRESETS,
  type PermissionKey,
} from '../../lib/permissions/catalog';
import type { Database } from '../db/database.types';
import { requestIp } from '../events/event-log';

export type RoleInput = { name: string; grantedKeys: PermissionKey[] };

const bodySchema = z
  .object({
    name: z.string().max(ROLE_NAME_MAX),
    grantedKeys: z.array(z.string()).max(PERMISSION_KEYS.length),
  })
  .strict();

// The body of POST and PATCH: the name (checked blank by the function, so the refusal carries its own code)
// and the full switch set, each a catalog key, no repeats.
export function parseRoleInput(raw: unknown): RoleInput | null {
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return null;
  const { name, grantedKeys } = parsed.data;
  if (!grantedKeys.every((k) => isPermissionKey(k))) return null;
  if (new Set(grantedKeys).size !== grantedKeys.length) return null;
  return { name, grantedKeys: grantedKeys as PermissionKey[] };
}

export function isRoleId(id: string): boolean {
  return z.uuid().safeParse(id).success;
}

export type RoleRefusal = { status: number; code: string };

type DbError = { code?: string; message?: string };

export function roleRefusal(error: DbError): RoleRefusal | null {
  const message = error.message ?? '';
  switch (error.code) {
    case '42501':
      return { status: 403, code: 'permission_denied' };
    case 'P0002':
      return { status: 404, code: 'role_not_found' };
    case '22023':
      return message === 'role_name_required'
        ? { status: 400, code: 'role_name_required' }
        : { status: 400, code: 'invalid_input' };
    case '23505':
      return message === 'role_name_taken' ? { status: 400, code: 'role_name_taken' } : null;
    case 'P0001':
      if (message === 'role_in_use') return { status: 409, code: 'role_in_use' };
      if (message === 'preset_role_change_refused') return { status: 409, code: 'role_preset' };
      return null;
    default:
      return null;
  }
}

const keys = z
  .array(z.string())
  .transform((list) => list.filter((k): k is PermissionKey => isPermissionKey(k)));
const summarySchema = z.object({
  id: z.string(),
  name: z.string(),
  preset: z.enum(ROLE_PRESETS).nullable(),
  defaultPermissions: keys,
  holders: z.number().int().nonnegative(),
});

export async function listRoles(client: SupabaseClient<Database>): Promise<RoleSummary[]> {
  const { data, error } = await client.rpc('list_roles');
  if (error) throw error;
  const parsed = z.array(summarySchema).safeParse(data);
  if (!parsed.success) throw new Error('list_roles_bad_result');
  return parsed.data;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; refusal: RoleRefusal };

const writeResult = z.object({
  roleId: z.string(),
  tenantId: z.string(),
  name: z.string(),
  defaultPermissions: keys.optional(),
  fields: z.array(z.enum(['name', 'default_permissions'])).optional(),
});
export type RoleWriteResult = z.infer<typeof writeResult>;

function finish(
  fn: 'create_role' | 'update_role' | 'delete_role',
  data: unknown,
  error: DbError | null,
): Outcome<RoleWriteResult> {
  if (error) {
    const refusal = roleRefusal(error);
    if (refusal) return { ok: false, refusal };
    throw error;
  }
  const parsed = writeResult.safeParse(data);
  if (!parsed.success) throw new Error(`${fn}_bad_result`);
  return { ok: true, value: parsed.data };
}

export async function createRole(client: SupabaseClient<Database>, input: RoleInput) {
  const { data, error } = await client.rpc('create_role', {
    p_name: input.name,
    p_granted: input.grantedKeys,
    // EZD-109: the request IP for the event_log row the function writes (null outside a request).
    p_ip: (await requestIp()) as string,
  });
  return finish('create_role', data, error);
}

export async function updateRole(client: SupabaseClient<Database>, id: string, input: RoleInput) {
  const { data, error } = await client.rpc('update_role', {
    p_role_id: id,
    p_name: input.name,
    p_granted: input.grantedKeys,
    // EZD-109: the request IP for the event_log row the function writes (null outside a request).
    p_ip: (await requestIp()) as string,
  });
  return finish('update_role', data, error);
}

export async function deleteRole(client: SupabaseClient<Database>, id: string) {
  const { data, error } = await client.rpc('delete_role', {
    p_role_id: id,
    p_ip: (await requestIp()) as string,
  });
  return finish('delete_role', data, error);
}
