// EZD-007c Step 4 (vault/plans/EZD-007c.md): who is signed in. Missing settings, an Auth error, an
// unlinked auth user or an ended session (Q-0052 (c)) count as no session; a database failure rejects
// (Q-0168 (b)).
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { createSessionClient } from './supabase-server';

export type Session = { authUserId: string; appUserId: string; email: string };

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
  if (error) throw error;
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

export async function requireApiSession(): Promise<Session | Response> {
  const session = await getSession();
  if (session === null) {
    return Response.json(
      { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } },
      { status: 401 },
    );
  }
  return session;
}
