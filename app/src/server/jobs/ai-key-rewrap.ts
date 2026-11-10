// EZD-5601 Step 16 (vault/plans/EZD-5601.md "D-Rewrap"; Q-0637 rotation; Q-0638 "Key rotation rewraps every row
// before the old value is removed"; AC-EZD-5601-10): one pass per sweep re-encrypts up to REWRAP_BATCH stored
// AI keys whose encryption-key version is below the highest, with the runner's client (service_role). A row
// that does not decrypt is counted, reported by code and left as it is. The key is never logged or reported.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AiKeyDecryptError,
  decryptUserAiKey,
  encryptUserAiKey,
  parseEncryptionKeys,
} from '../assistant/key-crypto';
import type { Database } from '../db/database.types';
import { reportError } from '../errors/report';
import { createJobsDbClient } from './db';

export const REWRAP_BATCH = 200;

export async function rewrapStaleAiKeys(
  opts: {
    env?: Record<string, string | undefined>;
    onlyTenantId?: string;
    db?: SupabaseClient<Database>;
  } = {},
): Promise<{ rewrapped: number; failed: number }> {
  const keys = parseEncryptionKeys(opts.env ?? process.env);
  const db = opts.db ?? createJobsDbClient();

  let query = db
    .from('user_ai_key')
    .select('tenant_id, app_user_id, ciphertext, secret_version')
    .lt('secret_version', keys.highest);
  if (opts.onlyTenantId !== undefined) query = query.eq('tenant_id', opts.onlyTenantId);
  const { data, error } = await query.order('tenant_id').order('app_user_id').limit(REWRAP_BATCH);
  if (error) throw new Error('ai_key_rewrap_read_failed');

  let rewrapped = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const owner = { tenantId: row.tenant_id, appUserId: row.app_user_id };
    let plain: string;
    try {
      plain = decryptUserAiKey(
        { ciphertext: row.ciphertext, secretVersion: row.secret_version },
        owner,
        keys,
      );
    } catch (e) {
      if (!(e instanceof AiKeyDecryptError)) throw e;
      failed += 1;
      await reportError(new Error('ai_key_undecryptable'), {
        source: 'job',
        location: 'ai_key_rewrap',
      });
      continue;
    }
    const { ciphertext, secretVersion } = encryptUserAiKey(plain, owner, keys);
    const updated = await db
      .from('user_ai_key')
      .update({ ciphertext, secret_version: secretVersion })
      .eq('tenant_id', row.tenant_id)
      .eq('app_user_id', row.app_user_id)
      .eq('secret_version', row.secret_version)
      .select('app_user_id');
    if (updated.error) throw new Error('ai_key_rewrap_write_failed');
    rewrapped += updated.data.length;
  }
  return { rewrapped, failed };
}
