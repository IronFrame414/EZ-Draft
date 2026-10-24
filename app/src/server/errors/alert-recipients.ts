// EZD-024 Step 5 (vault/plans/EZD-024.md; Q-0067 (b)): who gets an alert. A new error goes to ALERT_EMAIL_TO
// only (errors belong to no company); a failed job or webhook also goes to the Owner(s) of that company: its
// active members who hold Manage users and settings. Until EZD-101 adds user_permission that permission is
// held exactly by the Owner preset (10 preset table), so the query is app_user.role_preset = 'owner'; EZD-101
// switches it to the permission key. `db` is always the job runner's client (service_role): the request path
// never reads members.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../db/database.types';

export type AlertKind = 'error' | 'job_failed' | 'webhook_failed';
export type AlertRecipient = { userId: string | null; email: string };

type Env = Record<string, string | undefined>;
const emailSchema = z.email();

export async function ownerAlertRecipients(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<Array<{ userId: string; email: string }>> {
  const { data, error } = await db
    .from('membership')
    .select('user_id, app_user!membership_user_id_fkey!inner(id, email, role_preset)')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .eq('app_user.role_preset', 'owner');
  if (error) throw new Error('owner_lookup_failed');
  return (data ?? [])
    .map((row) => ({ userId: row.app_user.id, email: row.app_user.email }))
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

export async function alertRecipients(input: {
  kind: AlertKind;
  tenantId: string | null;
  db?: SupabaseClient<Database>;
  env: Env;
}): Promise<AlertRecipient[]> {
  const out: AlertRecipient[] = [];
  const operator = input.env.ALERT_EMAIL_TO?.trim();
  if (operator && emailSchema.safeParse(operator).success)
    out.push({ userId: null, email: operator });
  if (input.kind === 'error' || !input.tenantId || !input.db) return out;
  const seen = new Set(out.map((r) => r.email.toLowerCase()));
  for (const owner of await ownerAlertRecipients(input.db, input.tenantId)) {
    const key = owner.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(owner);
  }
  return out;
}
