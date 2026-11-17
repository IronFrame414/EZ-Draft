// EZD-111 (vault/plans/EZD-111.md P111 S2-S5; Decided D-Order, D-Email, D-Email throw, D-Mark failure, D-Expiry;
// Q-0700; Q-0701; 03b rule 11): a send to the project's client. Every write goes through the member's session
// client to send_to_client, which checks Send to client and project scope again and reads the recipient itself.
// The row and its checkpoint exist before the email, so the emailed link always resolves; a failed email keeps
// email_sent_at null and the caller still gets the link (Copy link). The token and the link leave here only in
// the result and the email; nothing in this file logs.
import type { SupabaseClient } from '@supabase/supabase-js';
import { effectiveValue } from '../../lib/defaults/values';
import type { ClientSend, SendHolder, SendRecipient } from '../../lib/sends/sends';
import { loadTenantDefaults } from '../defaults/defaults';
import { requestIp } from '../events/event-log';
import type { Database } from '../db/database.types';
import { EmailInputError, sendEmail, toSubjectLine } from '../email/send';
import type { SendEmailInput, SendEmailResult } from '../email/types';
import { appOrigin } from '../errors/app-origin';
import { captureToSentry } from '../errors/sentry';
import { getT } from '../messages/get-t';
import { clientLinkPath, newClientToken } from './token';

export type ReadRecipientResult =
  | { ok: true; recipient: SendRecipient | null }
  | { ok: false; code: 'project_not_found' };

// The project's client as the member's session sees it (RLS: project scope, own company).
export async function readSendRecipient(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<ReadRecipientResult> {
  const project = await client.from('project').select('customer_id').eq('id', projectId).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return { ok: false, code: 'project_not_found' };
  const customerId = project.data.customer_id;
  if (customerId === null) return { ok: true, recipient: null };
  const customer = await client
    .from('customer')
    .select('name, email')
    .eq('id', customerId)
    .maybeSingle();
  if (customer.error) throw customer.error;
  if (customer.data === null) return { ok: true, recipient: null };
  return { ok: true, recipient: { name: customer.data.name, email: customer.data.email } };
}

// The Defaults "Share link expiry" (S15d:46): the company's stored value, else the registry default (30 days).
export async function shareLinkExpiryDays(client: SupabaseClient<Database>): Promise<number> {
  const v = effectiveValue('share_link_expiry', await loadTenantDefaults(client));
  if (typeof v !== 'number') throw new Error('share_link_expiry_missing');
  return v;
}

export type ClientSendOutcome =
  | { ok: true; send: ClientSend }
  | { ok: false; code: 'permission_denied' | 'project_not_found' | 'no_client' | 'invalid_input' };

type SendRow = {
  sent_package_id: string;
  model_version_id: string;
  version_no: number;
  expires_at: string;
  project_name: string;
  recipient: SendRecipient;
  company: { name: string; reply_to: string | null };
  sender_email: string | null;
  holder: { name: string; saved_at: string | null } | null;
};

export async function sendToClient(
  client: SupabaseClient<Database>,
  input: { projectId: string; note: string | null },
  deps: {
    send?: (input: SendEmailInput) => Promise<SendEmailResult>;
    env?: Record<string, string | undefined>;
    requestIp?: () => Promise<string | null>;
  } = {},
): Promise<ClientSendOutcome> {
  const env = deps.env ?? process.env;
  const send = deps.send ?? ((i: SendEmailInput) => sendEmail(i, { env }));
  const trimmed = input.note === null ? '' : input.note.trim();
  const note = trimmed === '' ? null : trimmed;
  const { token, hash } = newClientToken();
  const days = await shareLinkExpiryDays(client);

  const { data, error } = await client.rpc('send_to_client', {
    p_project: input.projectId,
    p_token_hash: hash,
    // The generated type has no null for a text argument; the function takes null for "no note".
    p_note: note as string,
    p_expiry_days: days,
    // EZD-121: the event_log version.sent row's address; null outside a request (the argument types say inet).
    p_ip: (await (deps.requestIp ?? requestIp)()) as string,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
    if (error.code === 'P0001' && error.message === 'no_client') return { ok: false, code: 'no_client' };
    if (error.code === '22023') return { ok: false, code: 'invalid_input' };
    throw error;
  }
  const row = data as unknown as SendRow;
  const link = appOrigin(env) + clientLinkPath(token);

  const t = getT('office', 'en');
  const company = row.company.name;
  const project = row.project_name;
  const paragraphs = [
    t('office.send.email_greeting', { client: row.recipient.name }),
    t('office.send.email_body', { company, project }),
  ];
  if (note !== null) paragraphs.push(note);
  let emailSent = false;
  try {
    const result = await send({
      to: row.recipient.email,
      // Q-0701 (07; EZD-389): the sender gets a copy to forward.
      sentBy: row.sender_email ? { email: row.sender_email } : null,
      subject: toSubjectLine(t('office.send.email_subject', { company, project })),
      paragraphs,
      link: { url: link, label: t('office.send.email_link') },
      company: { name: company, replyTo: row.company.reply_to },
      lang: 'en',
      idempotencyKey: 'sent_package:' + row.sent_package_id,
    });
    emailSent = result.status === 'sent';
  } catch (e) {
    if (!(e instanceof EmailInputError)) throw e;
  }

  if (emailSent) {
    const mark = await client.rpc('mark_sent_package_emailed', {
      p_sent_package: row.sent_package_id,
    });
    if (mark.error) {
      captureToSentry(new Error('sent_package_mark_failed'), {
        source: 'function',
        location: 'sends.mark',
      });
    }
  }

  const holder: SendHolder | null =
    row.holder === null ? null : { name: row.holder.name, savedAt: row.holder.saved_at };
  return {
    ok: true,
    send: {
      id: row.sent_package_id,
      modelVersionId: row.model_version_id,
      versionNo: row.version_no,
      link,
      emailSent,
      recipient: row.recipient,
      holder,
      expiresAt: row.expires_at,
    },
  };
}
