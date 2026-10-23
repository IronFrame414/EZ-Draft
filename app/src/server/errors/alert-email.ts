// EZD-024 Step 5 and Step 8 (vault/plans/EZD-024.md; Q-0067 (b), Q-0069 (a)): the owner alert email. One
// sendEmail per recipient, English office wording (R26 R17), no company (an alert is sent by the system, so
// From is EMAIL_FROM). No person presses Send, so there is no sender screen for the copy link of Q-0035;
// sendEmail still returns the link and this module ignores it.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { sendEmail } from '../email/send';
import { getT } from '../messages/get-t';
import { alertRecipients, type AlertKind } from './alert-recipients';
import { appOrigin } from './app-origin';
import { captureToSentry } from './sentry';

type Env = Record<string, string | undefined>;

export type AlertParams =
  | { kind: 'error'; title: string; source: string; location: string; eventId: string | null }
  | {
      kind: 'job_failed';
      jobKind: string;
      attempts: number;
      error: string;
      jobId: string;
      projectId: string | null;
    }
  | {
      kind: 'webhook_failed';
      event: string;
      eventId: string;
      attempts: number;
      status: number | string;
    };

function content(params: AlertParams, env: Env) {
  const t = getT('office', 'en');
  const openApp = { url: appOrigin(env), label: t('office.alert.open_app') };
  if (params.kind === 'error') {
    const paragraphs = [
      t('office.alert.error.body', { source: params.source, location: params.location }),
    ];
    if (params.eventId) paragraphs.push(t('office.alert.error.event', { eventId: params.eventId }));
    const issues = env.SENTRY_ISSUES_URL?.trim();
    const link =
      issues && params.eventId
        ? {
            url: `${issues}?query=${encodeURIComponent(params.eventId)}`,
            label: t('office.alert.error.link'),
          }
        : openApp;
    return { subject: t('office.alert.error.subject', { title: params.title }), paragraphs, link };
  }
  if (params.kind === 'job_failed') {
    return {
      subject: t('office.alert.job.subject', { kind: params.jobKind }),
      paragraphs: [
        t('office.alert.job.body', {
          kind: params.jobKind,
          attempts: params.attempts,
          error: params.error,
          jobId: params.jobId,
          projectId: params.projectId ?? 'none',
        }),
      ],
      link: openApp,
    };
  }
  return {
    subject: t('office.alert.webhook.subject', { event: params.event }),
    paragraphs: [
      t('office.alert.webhook.body', {
        event: params.event,
        eventId: params.eventId,
        attempts: params.attempts,
        status: params.status,
      }),
    ],
    link: openApp,
  };
}

export async function sendOwnerAlert(input: {
  kind: AlertKind;
  alertId: string;
  claim: string;
  params: AlertParams;
  tenantId: string | null;
  db: SupabaseClient<Database>;
  env: Env;
}): Promise<'emailed' | 'email_failed'> {
  const release = async () => {
    try {
      await input.db.rpc('release_error_alert_email', {
        p_alert_id: input.alertId,
        p_claim: input.claim,
      });
    } catch {
      // The claim stays; the row is then treated as emailed.
    }
  };

  let recipients: Awaited<ReturnType<typeof alertRecipients>>;
  try {
    recipients = await alertRecipients({
      kind: input.kind,
      tenantId: input.tenantId,
      db: input.db,
      env: input.env,
    });
  } catch {
    recipients = [];
  }
  if (recipients.length === 0) {
    await release();
    return 'email_failed';
  }

  const { subject, paragraphs, link } = content(input.params, input.env);
  let sent = 0;
  for (const recipient of recipients) {
    const idempotencyKey =
      recipient.userId === null
        ? `alert-${input.alertId}`
        : `alert-${input.alertId}-${recipient.userId}`;
    try {
      const result = await sendEmail(
        { to: recipient.email, subject, paragraphs, link, lang: 'en', idempotencyKey },
        { env: input.env },
      );
      if (result.status === 'sent') sent += 1;
    } catch {
      // An invalid input counts as a failed send.
    }
  }
  if (sent > 0) return 'emailed';
  await release();
  captureToSentry(new Error('alert_email_failed'), {
    source: 'function',
    location: 'alert.email',
  });
  return 'email_failed';
}
