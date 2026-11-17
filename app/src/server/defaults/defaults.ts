// EZD-116 (S15d; Q-0697 decisions 03 "Defaults data"): the server side of Settings > Defaults. The stored
// company values are read from tenant.defaults under the member's session (RLS: their own company); the save
// is checked here from the registry (types, ranges, rules between rows on the values after the save) and
// written through update_tenant_defaults, which checks settings_defaults again and writes only the keys sent.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { STORABLE_KEYS, defaultRow } from '../../lib/defaults/registry';
import {
  applyChanges,
  checkValue,
  crossCheck,
  effectiveDefaults,
  type Changes,
  type StoredDefaults,
} from '../../lib/defaults/values';
import type { Database, Json } from '../db/database.types';
import type { MessageKey } from '../messages/catalog';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export async function loadTenantDefaults(client: SupabaseClient<Database>): Promise<StoredDefaults> {
  const { data, error } = await client.from('tenant').select('defaults').maybeSingle();
  if (error) throw error;
  return isObject(data?.defaults) ? data.defaults : {};
}

// A project's own copy (project.settings.defaults), {} when there is none.
export function projectCopyOf(settings: unknown): StoredDefaults {
  if (!isObject(settings)) return {};
  const d = settings.defaults;
  return isObject(d) ? d : {};
}

const bodySchema = z.strictObject({ changes: z.record(z.string(), z.unknown()) });

export type ParsedChanges =
  | { ok: true; changes: Changes }
  | { ok: false; fields?: Record<string, MessageKey> };

// The PATCH body `{ changes: { <key>: value | null } }`: a key outside the registry's stored keys is refused;
// each value is checked by its row's type; null removes the key.
export function parseDefaultsChanges(body: unknown): ParsedChanges {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false };
  const entries = Object.entries(parsed.data.changes);
  if (entries.length === 0) return { ok: false };
  const fields: Record<string, MessageKey> = {};
  const changes: Changes = {};
  for (const [key, value] of entries) {
    const row = defaultRow(key);
    if (!row || !STORABLE_KEYS.includes(key)) return { ok: false };
    if (value === null) {
      changes[key] = null;
      continue;
    }
    const check = checkValue(row, value);
    if (!check.ok) fields[key] = check.messageKey;
    else changes[key] = value as Changes[string];
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, changes };
}

// The rules between rows, on the effective values after the save (S15d:62; Q-0706).
export function crossCheckAfter(stored: StoredDefaults, changes: Changes): Record<string, MessageKey> {
  return crossCheck(effectiveDefaults(applyChanges(stored, changes)));
}

export type SaveDefaultsResult =
  | { ok: true; tenantId: string; stored: StoredDefaults; changed: string[] }
  | { ok: false; code: 'permission_denied' | 'invalid_input' };

export async function saveTenantDefaults(
  client: SupabaseClient<Database>,
  changes: Changes,
): Promise<SaveDefaultsResult> {
  const set: Record<string, Json> = {};
  const remove: string[] = [];
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) remove.push(k);
    else set[k] = v as Json;
  }
  const { data, error } = await client.rpc('update_tenant_defaults', {
    p_set: set,
    p_remove: remove,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const row = data?.[0];
  if (!row) throw new Error('update_tenant_defaults_no_row');
  return {
    ok: true,
    tenantId: row.tenant_id,
    stored: isObject(row.tenant_defaults) ? row.tenant_defaults : {},
    changed: row.changed,
  };
}
