// EZD-111 (vault/plans/EZD-111.md P111 S6, D-Resolver; 03b rule 11; Q-0700 03 row; 09p Token #2-#4): the client
// link's lookup for the client page (EZD-1202) and the Share panel (EZD-1201). A value that is not a token shape
// returns null without a database call; otherwise resolve_sent_package with the token's hash, through a
// signed-out client that carries the API gate header (the client page has no member session). Unknown,
// expired and revoked links, and links of a deleted project, return null.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { hashClientToken, isClientToken } from './token';

export type ResolvedSentPackage = {
  sentPackageId: string;
  tenantId: string;
  projectId: string;
  modelVersionId: string;
  kind: 'client' | 'permit' | 'co' | 'supplier';
  expiresAt: string;
};

const SIGNED_OUT_JAR: SessionCookieJar = { getAll: () => [], set: () => {}, isHttps: () => false };

export async function resolveClientLink(
  token: unknown,
  client?: SupabaseClient<Database>,
): Promise<ResolvedSentPackage | null> {
  if (!isClientToken(token)) return null;
  const db = client ?? createSessionClient(SIGNED_OUT_JAR);
  const { data, error } = await db.rpc('resolve_sent_package', {
    p_token_hash: hashClientToken(token),
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    sentPackageId: row.sent_package_id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    modelVersionId: row.model_version_id,
    kind: row.kind as ResolvedSentPackage['kind'],
    expiresAt: row.expires_at,
  };
}
