// EZD-105b (vault/plans/EZD-105b.md Decided "`setOwnerPassword` steps", "Password maker", "Email", "Secrets";
// Q-0096 P3, P4, P5, P7; Q-0695 decisions 10 row 65 and 03 row 33): the Owner-set password. Order:
// (1) owner_password_target checks the caller (Owner preset) and the member and answers their Auth id;
// (2) the password is made here, never typed; (3) Auth gets it through the one narrow admin file;
// (4) record_member_password_set ends the member's sessions and writes the event_log row in one transaction;
// (5) the member is emailed that it was set; (6) the password is returned once. Auth is reached over HTTP,
// so step 3 cannot share step 4's transaction: a failure after step 3 leaves a password nobody knows and the
// old sessions alive, which is safe. The password never goes into a log, a report, an error or the email.
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { validateNewPassword } from '../../lib/auth/password-rules';
import { setMemberPassword } from '../auth/admin-auth';
import type { Database } from '../db/database.types';
import { sendEmail } from '../email';
import type { SendEmailInput } from '../email/types';
import { appOrigin } from '../errors/app-origin';
import { reportError } from '../errors/report';
import { reportRouteFailure } from '../errors/route-failure';
import { getT } from '../messages/get-t';

export const ROUTE = '/api/settings/users/[id]/password';

// A-Z without I and O, a-z without l and o, 2-9: no look-alike characters for a password read aloud.
export const GENERATED_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const GENERATED_PASSWORD_LENGTH = 16;
export const GENERATE_TRIES = 10;

export function generateMemberPassword(
  email: string,
  randomIndex: (size: number) => number = (n) => randomInt(n),
): string {
  for (let attempt = 0; attempt < GENERATE_TRIES; attempt++) {
    let candidate = '';
    for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
      candidate += GENERATED_PASSWORD_ALPHABET[randomIndex(GENERATED_PASSWORD_ALPHABET.length)];
    }
    if (validateNewPassword(candidate, email).length === 0) return candidate;
  }
  throw new Error('owner_password_generate_failed');
}

export type OwnerPasswordCode =
  | 'permission_denied'
  | 'member_not_found'
  | 'password_target_refused'
  | 'db_unavailable';

export type OwnerPasswordResult =
  | { status: 200; body: { password: string; emailSent: boolean } }
  | { status: 403 | 404 | 500; code: OwnerPasswordCode };

export type OwnerPasswordDeps = {
  newPassword: (email: string) => string;
  setMemberPassword: (authUserId: string, password: string) => Promise<void>;
  sendEmail: typeof sendEmail;
};

const defaultDeps: OwnerPasswordDeps = {
  newPassword: (e) => generateMemberPassword(e),
  setMemberPassword,
  sendEmail,
};

export function buildOwnerPasswordEmail(
  input: {
    to: string;
    actor: string;
    actorEmail: string;
    companyName: string;
    replyTo: string | null;
  },
  env: Record<string, string | undefined> = process.env,
): SendEmailInput {
  const t = getT('office', 'en');
  return {
    to: input.to,
    sentBy: { email: input.actorEmail },
    subject: t('office.users.password_email_subject'),
    paragraphs: [t('office.users.password_email_body', { actor: input.actor, email: input.to })],
    link: { url: appOrigin(env), label: t('office.profile.email_link') },
    company: { name: input.companyName, replyTo: input.replyTo },
    lang: 'en',
  };
}

const targetSchema = z.object({ authUserId: z.string().min(1), email: z.string().min(1) });
const recordSchema = z.object({
  memberEmail: z.string().min(1),
  actorLabel: z.string().min(1),
  actorEmail: z.string().min(1),
  companyName: z.string(),
  companyReplyTo: z.string().nullable(),
});

type DbError = { code?: string } | null;

function refusal(error: DbError): OwnerPasswordResult | null {
  switch (error?.code) {
    case '42501':
      return { status: 403, code: 'permission_denied' };
    case 'P0002':
      return { status: 404, code: 'member_not_found' };
    case 'P0001':
      return { status: 403, code: 'password_target_refused' };
    default:
      return null;
  }
}

const UNAVAILABLE: OwnerPasswordResult = { status: 500, code: 'db_unavailable' };

async function report(code: string): Promise<void> {
  try {
    await reportError(new Error(code), { source: 'function', location: ROUTE });
  } catch {
    /* reportError never throws; guarded so this module never does either */
  }
}

export async function setOwnerPassword(
  client: SupabaseClient<Database>,
  membershipId: string,
  ip: string | null,
  deps: OwnerPasswordDeps = defaultDeps,
): Promise<OwnerPasswordResult> {
  // (1) the check.
  const target = await client.rpc('owner_password_target', { p_membership_id: membershipId });
  if (target.error) {
    const refused = refusal(target.error);
    if (refused) return refused;
    await reportRouteFailure(target.error, ROUTE);
    return UNAVAILABLE;
  }
  const who = targetSchema.safeParse(target.data);
  if (!who.success) {
    await report('owner_password_target_empty');
    return UNAVAILABLE;
  }

  // (2) and (3): made here, set in Auth.
  let password: string;
  try {
    password = deps.newPassword(who.data.email);
  } catch {
    await report('owner_password_generate_failed');
    return UNAVAILABLE;
  }
  try {
    await deps.setMemberPassword(who.data.authUserId, password);
  } catch {
    await report('owner_password_admin_failed');
    return UNAVAILABLE;
  }

  // (4) sessions ended and event_log written in one transaction.
  const record = await client.rpc('record_member_password_set', {
    p_membership_id: membershipId,
    // p_ip takes null when there is no client address; the generated argument types do not say so.
    p_ip: ip as string,
  });
  if (record.error) {
    const refused = refusal(record.error);
    await report(refused ? 'owner_password_record_refused' : 'owner_password_record_failed');
    return refused ?? UNAVAILABLE;
  }
  const done = recordSchema.safeParse(record.data);
  if (!done.success) {
    await report('owner_password_record_failed');
    return UNAVAILABLE;
  }

  // (5) the email; a failed send never fails the request (sendEmail reports a failed send itself).
  let emailSent = false;
  try {
    const sent = await deps.sendEmail(
      buildOwnerPasswordEmail({
        to: done.data.memberEmail,
        actor: done.data.actorLabel,
        actorEmail: done.data.actorEmail,
        companyName: done.data.companyName,
        replyTo: done.data.companyReplyTo,
      }),
    );
    emailSent = sent.status === 'sent';
  } catch {
    await report('owner_password_email_failed');
  }

  // (6) shown once.
  return { status: 200, body: { password, emailSent } };
}
