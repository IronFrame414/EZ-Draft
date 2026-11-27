// EZD-2020 (external security audit 2026-11-27 X3; AC-EZD-2020-1): the hourly digest of tunnel alerts. Anyone
// can post a made-up error to /api/monitoring, so a browser or worker report never gets its own owner email
// (record_error_alert hands it no claim). The sweep calls this once a minute; claim_tunnel_alert_digest gives
// out at most one claim per rolling hour, covering every tunnel row not yet emailed. The subject carries a
// count and the "reported by a browser (unverified)" mark, never a reported title. Recipients are those of a
// new error (ALERT_EMAIL_TO). A send that reaches nobody gives the rows back for the next sweep.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import { sendEmail, toSubjectLine } from '../email/send';
import { getT } from '../messages/get-t';
import { alertRecipients } from './alert-recipients';
import { appOrigin } from './app-origin';
import { captureToSentry } from './sentry';

type Env = Record<string, string | undefined>;

// How many reported titles the email lists; the rest are counted in one line.
export const DIGEST_LIST_MAX = 20;

export type DigestRow = {
  source: string;
  title: string;
  occurrences: number;
  ref: string | null;
};

export type DigestResult = { status: 'none' | 'emailed' | 'email_failed'; count: number };

export function digestContent(rows: DigestRow[], env: Env) {
  const t = getT('office', 'en');
  const subject = toSubjectLine(t('office.alert.digest.subject', { count: rows.length }));
  const paragraphs = [t('office.alert.digest.body')];
  for (const row of rows.slice(0, DIGEST_LIST_MAX)) {
    paragraphs.push(
      t('office.alert.digest.line', {
        title: row.title,
        source: row.source,
        occurrences: row.occurrences,
      }),
    );
  }
  if (rows.length > DIGEST_LIST_MAX) {
    paragraphs.push(t('office.alert.digest.more', { count: rows.length - DIGEST_LIST_MAX }));
  }
  const issues = env.SENTRY_ISSUES_URL?.trim();
  const link = issues
    ? { url: issues, label: t('office.alert.error.link') }
    : { url: appOrigin(env), label: t('office.alert.open_app') };
  return { subject, paragraphs, link };
}

export async function sendTunnelAlertDigest(deps: {
  db: SupabaseClient<Database>;
  env?: Env;
}): Promise<DigestResult> {
  const env = deps.env ?? process.env;
  const { data, error } = await deps.db.rpc('claim_tunnel_alert_digest');
  if (error) throw new Error('tunnel_digest_claim_failed');
  const rows = data ?? [];
  if (rows.length === 0) return { status: 'none', count: 0 };
  const claim = rows[0].claim;

  const release = async () => {
    try {
      await deps.db.rpc('release_tunnel_alert_digest', { p_claim: claim });
    } catch {
      // The rows stay stamped; they are then treated as emailed.
    }
  };

  let recipients: Awaited<ReturnType<typeof alertRecipients>>;
  try {
    recipients = await alertRecipients({ kind: 'error', tenantId: null, env });
  } catch {
    recipients = [];
  }
  if (recipients.length === 0) {
    await release();
    return { status: 'email_failed', count: rows.length };
  }

  const { subject, paragraphs, link } = digestContent(rows, env);
  let sent = 0;
  for (const recipient of recipients) {
    const idempotencyKey =
      recipient.userId === null
        ? `alert-digest-${claim}`
        : `alert-digest-${claim}-${recipient.userId}`;
    try {
      const result = await sendEmail(
        { to: recipient.email, sentBy: null, subject, paragraphs, link, lang: 'en', idempotencyKey },
        { env },
      );
      if (result.status === 'sent') sent += 1;
    } catch {
      // An invalid input counts as a failed send.
    }
  }
  if (sent > 0) return { status: 'emailed', count: rows.length };
  await release();
  captureToSentry(new Error('alert_email_failed'), {
    source: 'function',
    location: 'alert.digest',
  });
  return { status: 'email_failed', count: rows.length };
}
