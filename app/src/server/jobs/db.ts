// EZD-009 Step 5 (vault/plans/EZD-009.md): the job runner's database client, with the secret key (job
// handlers only; docs/architecture.md Server-only data access). The only file in app/src that reads
// SUPABASE_SECRET_KEY. Both values are read per call; a missing key throws a fixed code, never the value.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { readPublicDbEnv } from '../db/env';

export function createJobsDbClient(): SupabaseClient<Database> {
  const { url } = readPublicDbEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error('supabase_secret_key_not_set');
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
