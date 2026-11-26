// EZD-1422 (S01 Input source "Field measure creates the project and sends the Foreman a link to 17b"; Q-0204
// "'Waiting for field measurements', who it was sent to and a Resend button; it never expires. The sender or anyone
// who can edit the project can cancel it."; AC-EZD-1422-1): the wizard's field measure request. Every write goes
// through the member's session client to the definer functions of …_field_measure_request.sql, which check the
// permission, the project scope and the Foreman again and read the Foreman's address themselves. The request is
// stored before the email, so a failed email keeps it (Resend, Copy link) and the caller is told emailSent false.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { EmailInputError, sendEmail, toSubjectLine } from '../email/send';
import type { SendEmailInput, SendEmailResult } from '../email/types';
import { appOrigin } from '../errors/app-origin';
import { getT } from '../messages/get-t';

/** The phone Field measure screen of a project (S17b; EZD-1415 route). */
export const fieldMeasurePath = (projectId: string): string =>
  `/projects/${projectId}/field-measure`;

import type { FieldMeasureRequestSent } from '../../lib/projects/field-measure-request';
export type { FieldMeasureRequestSent };

export type FieldMeasureRequestOutcome =
  | { ok: true; request: FieldMeasureRequestSent }
  | {
      ok: false;
      code:
        | 'permission_denied'
        | 'project_not_found'
        | 'foreman_unavailable'
        | 'already_requested'
        | 'not_waiting';
    };

type Payload = {
  request_id: string;
  sent_count: number;
  project_name: string;
  to: { name: string; email: string };
  company: { name: string; reply_to: string | null };
  sender_email: string | null;
};

type Deps = {
  send?: (input: SendEmailInput) => Promise<SendEmailResult>;
  env?: Record<string, string | undefined>;
};

type RpcError = { code?: string; message: string };

function refusal(error: RpcError): FieldMeasureRequestOutcome | null {
  if (error.code === '42501') return { ok: false, code: 'permission_denied' };
  if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
  if (error.message.includes('foreman_unavailable')) {
    return { ok: false, code: 'foreman_unavailable' };
  }
  if (error.code === 'P0001' && error.message === 'already_requested') {
    return { ok: false, code: 'already_requested' };
  }
  if (error.code === 'P0001' && error.message === 'not_waiting') {
    return { ok: false, code: 'not_waiting' };
  }
  return null;
}

async function emailLink(
  projectId: string,
  row: Payload,
  deps: Deps,
): Promise<FieldMeasureRequestOutcome> {
  const env = deps.env ?? process.env;
  const send = deps.send ?? ((i: SendEmailInput) => sendEmail(i, { env }));
  const link = appOrigin(env) + fieldMeasurePath(projectId);
  const t = getT('office', 'en');
  const company = row.company.name;
  const project = row.project_name;
  let emailSent = false;
  try {
    const result = await send({
      to: row.to.email,
      sentBy: row.sender_email ? { email: row.sender_email } : null,
      subject: toSubjectLine(t('office.field_measure_request.email_subject', { project })),
      paragraphs: [
        t('office.field_measure_request.email_greeting', { name: row.to.name }),
        t('office.field_measure_request.email_body', { company, project }),
      ],
      link: { url: link, label: t('office.field_measure_request.email_link') },
      company: { name: company, replyTo: row.company.reply_to },
      lang: 'en',
      // One email per send: the first request and each Resend.
      idempotencyKey: `field_measure_request:${row.request_id}:${row.sent_count}`,
    });
    emailSent = result.status === 'sent';
  } catch (e) {
    if (!(e instanceof EmailInputError)) throw e;
  }
  return { ok: true, request: { sentTo: row.to.name, link, emailSent } };
}

/** The wizard's request, right after the project is created: stores it and emails the Foreman the S17b link. */
export async function requestFieldMeasure(
  client: SupabaseClient<Database>,
  input: { projectId: string; membershipId: string },
  deps: Deps = {},
): Promise<FieldMeasureRequestOutcome> {
  const { data, error } = await client.rpc('request_field_measure', {
    p_project: input.projectId,
    p_membership: input.membershipId,
  });
  if (error) {
    const r = refusal(error);
    if (r) return r;
    throw error;
  }
  return emailLink(input.projectId, data as unknown as Payload, deps);
}

/** Q-0204 Resend: the same link emailed again to the same Foreman. */
export async function resendFieldMeasure(
  client: SupabaseClient<Database>,
  projectId: string,
  deps: Deps = {},
): Promise<FieldMeasureRequestOutcome> {
  const { data, error } = await client.rpc('resend_field_measure_request', {
    p_project: projectId,
  });
  if (error) {
    const r = refusal(error);
    if (r) return r;
    throw error;
  }
  return emailLink(projectId, data as unknown as Payload, deps);
}

export type FieldMeasureCancelOutcome =
  { ok: true } | { ok: false; code: 'permission_denied' | 'project_not_found' | 'not_waiting' };

/** Q-0204 Cancel: the project no longer waits for field measurements. */
export async function cancelFieldMeasure(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<FieldMeasureCancelOutcome> {
  const { error } = await client.rpc('cancel_field_measure_request', { p_project: projectId });
  if (error) {
    if (error.code === '42501') return { ok: false, code: 'permission_denied' };
    if (error.code === 'P0002') return { ok: false, code: 'project_not_found' };
    if (error.code === 'P0001' && error.message === 'not_waiting') {
      return { ok: false, code: 'not_waiting' };
    }
    throw error;
  }
  return { ok: true };
}
