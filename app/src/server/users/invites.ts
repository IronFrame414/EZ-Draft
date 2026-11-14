// EZD-105 (S15 Invite user, Row: Resend, Copy link, More menu Cancel invite; Q-0695 decisions 10 rows 59,
// 61-63; Q-0216; Q-0036; R24 #15): server-only helpers for the invite writes. Each write is one definer
// function under the inviter's session (supabase/migrations/20261113150001_create_invite_functions.sql) that
// checks settings_users again and writes its event_log row in its own transaction. This file parses the
// request, makes the per-invite random value and its token hash, calls the function with the request IP,
// sends the invite email through sendEmail with the company as sender, and returns the link and code to the
// sender whether the email went out or not (Copy link rule, architecture "Email (EZD-008)").
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../db/database.types';
import { sendEmail, toSubjectLine } from '../email';
import { reportError } from '../errors/report';
import { requestIp } from '../events/event-log';
import { getT } from '../messages/get-t';
import {
  inviteCode,
  inviteLink,
  inviteToken,
  inviteTokenHash,
  newInviteSecret,
} from './invite-token';
import type { MemberRefusal } from './members';

export const INVITE_EMAIL_MAX = 320;
export const INVITE_NAME_MAX = 100;

export type InviteInput = {
  email: string;
  name: string | null;
  roleId: string;
  language: 'en' | 'es';
  // null: the role's default (Owner and Designer all, every other role listed; S15 D13).
  scope: 'all' | 'listed' | null;
};

const inputSchema = z
  .object({
    email: z.string().max(INVITE_EMAIL_MAX),
    name: z.string().max(INVITE_NAME_MAX).nullable().optional(),
    roleId: z.uuid(),
    language: z.enum(['en', 'es']).optional(),
    scope: z.enum(['all', 'listed']).nullable().optional(),
  })
  .strict();

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(INVITE_EMAIL_MAX));

export type ParsedInvite = { ok: true; input: InviteInput } | { ok: false; code: string };

export function parseInviteInput(raw: unknown): ParsedInvite {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'invalid_input' };
  const email = emailSchema.safeParse(parsed.data.email);
  if (!email.success) return { ok: false, code: 'invalid_email' };
  const name = (parsed.data.name ?? '').trim();
  return {
    ok: true,
    input: {
      email: email.data,
      name: name === '' ? null : name,
      roleId: parsed.data.roleId,
      // Q-0029: new users default to English.
      language: parsed.data.language ?? 'en',
      scope: parsed.data.scope ?? null,
    },
  };
}

const REFUSALS_409 = new Set(['already_member', 'already_invited', 'deactivated_member', 'email_in_use']);

type DbError = { code?: string; message?: string };

// The functions' refusals (architecture "Errors and logging": a known refusal is a 4xx with its own code;
// anything else is thrown to the route's 500).
export function inviteRefusal(error: DbError): MemberRefusal | null {
  const message = error.message ?? '';
  switch (error.code) {
    case '42501':
      return { status: 403, code: 'permission_denied' };
    case 'P0002':
      return { status: 404, code: 'member_not_found' };
    case '22023':
      if (message === 'member_state') return { status: 409, code: 'member_state' };
      if (message === 'invalid_email') return { status: 400, code: 'invalid_email' };
      return { status: 400, code: 'invalid_input' };
    case 'P0001':
      return REFUSALS_409.has(message) ? { status: 409, code: message } : null;
    default:
      return null;
  }
}

export type InviteSent = {
  membershipId: string;
  appUserId: string;
  tenantId: string;
  link: string;
  code: string;
  expiresAt: string;
  emailSent: boolean;
};

export type CreatedInvite = InviteSent & { roleId: string; scope: 'all' | 'listed' };

type Outcome<T> = { ok: true; value: T } | { ok: false; refusal: MemberRefusal };

const sentSchema = z.object({
  membershipId: z.string(),
  appUserId: z.string(),
  tenantId: z.string(),
  email: z.string(),
  language: z.enum(['en', 'es']),
  expiresAt: z.string(),
  companyName: z.string(),
  companyEmail: z.string().nullable(),
  inviterName: z.string().nullable(),
});
const createdSchema = sentSchema.extend({
  roleId: z.string(),
  scope: z.enum(['all', 'listed']),
});

type SentRow = z.infer<typeof sentSchema>;

function freshSecret(): { secret: string; token: string; hash: string } {
  const secret = newInviteSecret();
  const token = inviteToken(secret);
  return { secret, token, hash: inviteTokenHash(token) };
}

// The invite email, in the invitee's language (S15 Invite user: "Send emails a magic-link invite"; the code
// is in it so they can join from the sign-in page, Q-0216). Never throws: a refused input or a failed send
// leaves emailSent false, and the sender still gets the link (R24 #15).
async function sendInviteEmail(
  row: SentRow,
  link: string,
  code: string,
  sentBy: { email: string },
  idempotencyKey: string,
): Promise<boolean> {
  const t = getT('sign_in', row.language);
  try {
    const result = await sendEmail({
      to: row.email,
      sentBy,
      subject: toSubjectLine(t('common.invite.email_subject', { company: row.companyName })),
      paragraphs: [
        t('common.invite.email_intro', { company: row.companyName }),
        t('common.invite.email_code', { code }),
        t('common.invite.email_expiry'),
      ],
      link: { url: link, label: t('common.invite.email_link') },
      company: {
        name: row.companyName,
        replyTo: row.companyEmail !== null && z.email().safeParse(row.companyEmail).success
          ? row.companyEmail
          : null,
      },
      lang: row.language,
      idempotencyKey,
    });
    return result.status === 'sent';
  } catch {
    // sendEmail reports a failed send itself; a refused input is reported here, by code only.
    await reportError(new Error('invite_email_failed'), {
      source: 'function',
      location: '/api/settings/users/invites',
    });
    return false;
  }
}

async function finish(
  row: SentRow,
  fresh: { secret: string; token: string; hash: string },
  sentBy: { email: string },
): Promise<InviteSent> {
  const link = inviteLink(fresh.token);
  const code = inviteCode(fresh.secret);
  const emailSent = await sendInviteEmail(
    row,
    link,
    code,
    sentBy,
    `invite:${row.membershipId}:${fresh.hash.slice(0, 16)}`,
  );
  return {
    membershipId: row.membershipId,
    appUserId: row.appUserId,
    tenantId: row.tenantId,
    link,
    code,
    expiresAt: row.expiresAt,
    emailSent,
  };
}

export async function createInvite(
  client: SupabaseClient<Database>,
  input: InviteInput,
  sentBy: { email: string },
): Promise<Outcome<CreatedInvite>> {
  const fresh = freshSecret();
  const { data, error } = await client.rpc('create_invite', {
    p_email: input.email,
    p_name: input.name as string,
    p_role_id: input.roleId,
    p_language: input.language,
    p_scope: input.scope as string,
    p_secret: fresh.secret,
    p_token_sha256: fresh.hash,
    p_ip: (await requestIp()) as string,
  });
  if (error) {
    const refusal = inviteRefusal(error);
    if (refusal) return { ok: false, refusal };
    throw error;
  }
  const parsed = createdSchema.safeParse(data);
  if (!parsed.success) throw new Error('create_invite_bad_result');
  const sent = await finish(parsed.data, fresh, sentBy);
  return { ok: true, value: { ...sent, roleId: parsed.data.roleId, scope: parsed.data.scope } };
}

export async function resendInvite(
  client: SupabaseClient<Database>,
  membershipId: string,
  sentBy: { email: string },
): Promise<Outcome<InviteSent>> {
  const fresh = freshSecret();
  const { data, error } = await client.rpc('resend_invite', {
    p_membership_id: membershipId,
    p_secret: fresh.secret,
    p_token_sha256: fresh.hash,
    p_ip: (await requestIp()) as string,
  });
  if (error) {
    const refusal = inviteRefusal(error);
    if (refusal) return { ok: false, refusal };
    throw error;
  }
  const parsed = sentSchema.safeParse(data);
  if (!parsed.success) throw new Error('resend_invite_bad_result');
  return { ok: true, value: await finish(parsed.data, fresh, sentBy) };
}

const actionSchema = z.object({ membershipId: z.string(), appUserId: z.string(), tenantId: z.string() });

export async function cancelInvite(
  client: SupabaseClient<Database>,
  membershipId: string,
): Promise<Outcome<z.infer<typeof actionSchema>>> {
  const { data, error } = await client.rpc('cancel_invite', {
    p_membership_id: membershipId,
    p_ip: (await requestIp()) as string,
  });
  if (error) {
    const refusal = inviteRefusal(error);
    if (refusal) return { ok: false, refusal };
    throw error;
  }
  const parsed = actionSchema.safeParse(data);
  if (!parsed.success) throw new Error('cancel_invite_bad_result');
  return { ok: true, value: parsed.data };
}

const secretSchema = z.object({
  membershipId: z.string(),
  secret: z.string(),
  expiresAt: z.string(),
});

// The pending invite's link and code for Copy link (Q-0216; Q-0706): the last sender and Owners only.
export async function inviteLinkFor(
  client: SupabaseClient<Database>,
  membershipId: string,
): Promise<Outcome<{ membershipId: string; link: string; code: string; expiresAt: string }>> {
  const { data, error } = await client.rpc('invite_link_secret', { p_membership_id: membershipId });
  if (error) {
    const refusal = inviteRefusal(error);
    if (refusal) return { ok: false, refusal };
    throw error;
  }
  const parsed = secretSchema.safeParse(data);
  if (!parsed.success) throw new Error('invite_link_secret_bad_result');
  const { secret, expiresAt } = parsed.data;
  return {
    ok: true,
    value: {
      membershipId,
      link: inviteLink(inviteToken(secret)),
      code: inviteCode(secret),
      expiresAt,
    },
  };
}
