// EZD-105 (Q-0695 decisions 10 row 61; architecture "Auth and session (EZD-007)", Allowed Supabase client
// files): the one narrow server-only file that uses the secret key for the invitee, who has no session yet.
// It holds five calls and nothing else:
// - inviteStatusByHash: invite_status, so the /invite page can show Accept or the refusal on GET (nothing changes);
// - acceptInviteByHash: accept_invite, the one database step that accepts the invite (service_role only);
// - inviteCodeTake (EZD-138): invite_code_take, the live unlocked invites for an email typed with an invite code,
//   each with one try added, and whether one is locked (service_role only; the caller compares the code);
// - magicLinkTokenHash: Auth admin generateLink(magiclink) for the accepted person's email, whose hashed token
//   the caller verifies on its own session client to make the session. Observed on the pinned stack: the
//   before-user-created hook runs for generateLink, so for an email with no auth user yet it succeeds only once
//   the membership is active (accept_invite runs first), and then it creates the auth user and answers
//   verification type `signup`;
// - setMemberPassword (EZD-105b, Q-0096 P3; Q-0695 decisions 10 row 65): Auth admin updateUserById for the
//   Owner-set password, called only after public.owner_password_target has allowed it. The password is never
//   logged or put in an error.
// The action link and its hashed token are never logged or returned to a browser. Both values are read per
// call; a missing key throws a fixed code, never the value.
// EZD-1932 (audit S8): a client import of this file fails the build (server-only) and lint (ezdraft/no-client-server-only).
import 'server-only';
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
  // EZD-2021: codeLocked, five wrong invite codes used (until Resend); the link itself still accepts.
  z.object({ live: z.literal(true), companyName: z.string(), codeLocked: z.boolean() }),
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

const takeSchema = z.object({
  invites: z.array(z.object({ secret: z.string().min(1), tries: z.number().int() })),
  locked: z.boolean(),
});

export type InviteCodeTake = z.infer<typeof takeSchema>;

// EZD-138 (Q-0695 decisions 10 row 61; 09n "Invite code tries"): the random values never leave the server.
export async function inviteCodeTake(email: string): Promise<InviteCodeTake> {
  const { data, error } = await adminClient().rpc('invite_code_take', { p_email: email });
  if (error) throw new Error('invite_code_take_failed');
  const parsed = takeSchema.safeParse(data);
  if (!parsed.success) throw new Error('invite_code_take_bad_result');
  return parsed.data;
}

// EZD-105b: sets a member's new password in Auth. Any Auth error or throw is one fixed code.
export async function setMemberPassword(authUserId: string, password: string): Promise<void> {
  let failed: boolean;
  try {
    const { error } = await adminClient().auth.admin.updateUserById(authUserId, { password });
    failed = error !== null;
  } catch {
    failed = true;
  }
  if (failed) throw new Error('admin_password_failed');
}
