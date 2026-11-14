// EZD-007c Step 4 (vault/plans/EZD-007c.md): who is signed in. Missing settings, an Auth error, an
// unlinked auth user or an ended session (Q-0052 (c)) count as no session; a database failure rejects
// (Q-0168 (b)). EZD-395: a 42501 from current_app_user_id once the verified token's exp has passed
// also counts as no session (expected cause: a failed refresh sent the call as anon).
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { createSessionClient } from './supabase-server';

export type Session = { authUserId: string; appUserId: string; email: string };

export function accessTokenEnded(exp: unknown, nowMs: number): boolean {
  return typeof exp === 'number' && Number.isFinite(exp) && exp * 1000 <= nowMs;
}

export const getSession = cache(async (): Promise<Session | null> => {
  let client: SupabaseClient<Database>;
  try {
    client = createSessionClient();
  } catch {
    return null;
  }
  const { data: claimsData, error: claimsError } = await client.auth.getClaims();
  const claims = claimsData?.claims;
  if (claimsError || !claims?.sub) return null;
  const { data, error } = await client.rpc('current_app_user_id');
  if (error) {
    // EZD-395: a 42501 once the verified token's exp has passed is no session (expected cause: a failed refresh sent the call as anon).
    if (error.code === '42501' && accessTokenEnded(claims.exp, Date.now())) return null;
    throw error;
  }
  // database.types.ts says string; the function returns null for an unlinked user or an ended session.
  const appUserId = data as string | null;
  if (appUserId === null) return null;
  return { authUserId: claims.sub, appUserId, email: claims.email as string };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (session === null) redirect('/sign-in');
  return session;
}

const headers = { 'Cache-Control': 'no-store' };

// EZD-349 (D-016): the 401 carries Cache-Control: no-store, as the 403 and 404 in can.ts do.
export async function requireApiSession(): Promise<Session | Response> {
  const session = await getSession();
  if (session === null) {
    return Response.json(
      { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } },
      { status: 401, headers },
    );
  }
  return session;
}
