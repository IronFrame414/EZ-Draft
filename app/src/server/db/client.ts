import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { readPublicDbEnv } from './env';

export function createPublicDbClient(): SupabaseClient<Database> {
  const { url, publishableKey } = readPublicDbEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
