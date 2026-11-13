// EZD-105 (Q-0695 decisions 10 row 61; architecture "Auth and session (EZD-007)", Allowed Supabase client
// files): the one narrow server-only file that uses the secret key for the invitee, who has no session yet.
// It holds three calls and nothing else:
// - inviteStatusByHash: invite_status, so the /invite page can show Accept or the refusal on GET (nothing changes);
// - acceptInviteByHash: accept_invite, the one database step that accepts the invite (service_role only);
// - magicLinkTokenHash: Auth admin generateLink(magiclink) for the accepted person's email, whose hashed token
//   the caller verifies on its own session client to make the session. Observed on the pinned stack: the
//   before-user-created hook runs for generateLink, so for an email with no auth user yet it succeeds only once
//   the membership is active (accept_invite runs first), and then it creates the auth user and answers
//   verification type `signup`.
// The action link and its hashed token are never logged or returned to a browser. Both values are read per
// call; a missing key throws a fixed code, never the value.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../db/database.types';
import { readPublicDbEnv } from '../db/env';

function adminClient(): SupabaseClient<Database> {
  const { url } = readPublicDbEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error('supabase_secret_key_not_set');
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const statusSchema = z.union([
  z.object({ live: z.literal(true), companyName: z.string() }),
  z.object({ live: z.literal(false) }),
]);

export type InviteStatus = z.infer<typeof statusSchema>;

export async function inviteStatusByHash(tokenHash: string): Promise<InviteStatus> {
  const { data, error } = await adminClient().rpc('invite_status', { p_token_sha256: tokenHash });
  if (error) throw new Error('invite_status_failed');
  const parsed = statusSchema.safeParse(data);
  if (!parsed.success) throw new Error('invite_status_bad_result');
  return parsed.data;
}

const acceptSchema = z.union([
  z.object({
    status: z.literal('accepted'),
    membershipId: z.string(),
    appUserId: z.string(),
    tenantId: z.string(),
    email: z.string(),
  }),
  z.object({ status: z.literal('refused') }),
]);

export type AcceptResult = z.infer<typeof acceptSchema>;

export async function acceptInviteByHash(tokenHash: string, ip: string | null): Promise<AcceptResult> {
  const { data, error } = await adminClient().rpc('accept_invite', {
    p_token_sha256: tokenHash,
    p_ip: ip as string,
  });
  if (error) throw new Error('accept_invite_failed');
  const parsed = acceptSchema.safeParse(data);
  if (!parsed.success) throw new Error('accept_invite_bad_result');
  return parsed.data;
}

// The hashed token and the type to verify it with: `signup` when generateLink just created the auth user
// (observed on the pinned stack), else `magiclink`.
export async function magicLinkTokenHash(
  email: string,
): Promise<{ tokenHash: string; type: 'magiclink' | 'signup' }> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  const hashed = data?.properties?.hashed_token;
  const kind = data?.properties?.verification_type;
  if (error || typeof hashed !== 'string' || hashed === '') throw new Error('invite_link_failed');
  if (kind !== 'magiclink' && kind !== 'signup') throw new Error('invite_link_failed');
  return { tokenHash: hashed, type: kind };
}
