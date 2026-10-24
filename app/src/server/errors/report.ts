// EZD-024 Steps 5 and 9 (vault/plans/EZD-024.md; Re-validation V1): every server error ends here. It captures
// to Sentry, records the fingerprint in error_alert through record_error_alert, and emails the owner only when
// the store hands out a claim (one email per new fingerprint, Q-0068 (a)). It never throws.
// The request path reaches the store as anon through the gated session client with an empty cookie jar: no
// cookie is read or written, and the secret key is never used here (EZD-009 T20).
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRegisteredEvent, EVENTS } from '../../lib/events/registry';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import type { JobRow } from '../jobs/registry';
import { sendOwnerAlert, type AlertParams } from './alert-email';
import type { AlertKind } from './alert-recipients';
import {
  errorFingerprint,
  errorMessage,
  errorTitle,
  errorType,
  normalizeLocation,
  sha256Hex,
  type ErrorSource,
} from './fingerprint';
import { captureToSentry } from './sentry';

type Env = Record<string, string | undefined>;

export type ReportAlert =
  'emailed' | 'already_emailed' | 'capped' | 'not_alerted' | 'email_failed' | 'store_unavailable';

export type ReportResult = {
  sentryEventId: string | null;
  alert: ReportAlert;
  alertId: string | null;
};

export type ReportContext = {
  source: 'function' | 'job';
  location: string;
  tags?: Record<string, string>;
  alert?: boolean;
};

const SIGNED_OUT_JAR: SessionCookieJar = { getAll: () => [], set: () => {}, isHttps: () => false };

export function alertStoreClient(): SupabaseClient<Database> {
  return createSessionClient(SIGNED_OUT_JAR);
}

const REF = /^[A-Za-z0-9-]{1,64}$/;

type RecordInput = {
  kind: AlertKind;
  source: ErrorSource | 'webhook';
  fingerprint: string;
  title: string;
  ref: string | null;
  tenantId: string | null;
  projectId: string | null;
  params: AlertParams;
};

// Records one occurrence and, with a claim, sends the alert.
export async function recordAndAlert(
  db: SupabaseClient<Database>,
  input: RecordInput,
  env: Env,
): Promise<{ alert: ReportAlert; alertId: string | null }> {
  let row: { alert_id: string | null; email_claim: string | null; capped: boolean } | undefined;
  try {
    const { data, error } = await db.rpc('record_error_alert', {
      p_kind: input.kind,
      p_source: input.source,
      p_fingerprint: input.fingerprint,
      p_title: input.title,
      p_ref: (input.ref !== null && REF.test(input.ref) ? input.ref : null) as string,
      p_tenant_id: input.tenantId as string,
      p_project_id: input.projectId as string,
    });
    if (error) return { alert: 'store_unavailable', alertId: null };
    row = data?.[0];
  } catch {
    return { alert: 'store_unavailable', alertId: null };
  }
  if (!row) return { alert: 'store_unavailable', alertId: null };
  if (!row.email_claim || !row.alert_id) {
    return { alert: row.capped ? 'capped' : 'already_emailed', alertId: row.alert_id };
  }
  try {
    const alert = await sendOwnerAlert({
      kind: input.kind,
      alertId: row.alert_id,
      claim: row.email_claim,
      params: input.params,
      tenantId: input.tenantId,
      db,
      env,
    });
    return { alert, alertId: row.alert_id };
  } catch {
    return { alert: 'email_failed', alertId: row.alert_id };
  }
}

export async function reportError(
  error: unknown,
  ctx: ReportContext,
  deps: { env?: Env } = {},
): Promise<ReportResult> {
  const env = deps.env ?? process.env;
  const sentryEventId = captureToSentry(error, {
    source: ctx.source,
    location: ctx.location,
    tags: ctx.tags,
  });
  if (ctx.alert === false) return { sentryEventId, alert: 'not_alerted', alertId: null };
  try {
    const type = errorType(error);
    const message = errorMessage(error);
    const location = normalizeLocation(ctx.source, ctx.location);
    const fingerprint = await errorFingerprint({ source: ctx.source, type, message, location });
    const title = errorTitle(type, message);
    let db: SupabaseClient<Database>;
    try {
      db = alertStoreClient();
    } catch {
      return { sentryEventId, alert: 'store_unavailable', alertId: null };
    }
    const outcome = await recordAndAlert(
      db,
      {
        kind: 'error',
        source: ctx.source,
        fingerprint,
        title,
        ref: sentryEventId,
        tenantId: null,
        projectId: null,
        params: { kind: 'error', title, source: ctx.source, location, eventId: sentryEventId },
      },
      env,
    );
    return { sentryEventId, ...outcome };
  } catch {
    return { sentryEventId, alert: 'store_unavailable', alertId: null };
  }
}

// A job that reached `failed` (EZD-009 onJobFailed). `db` is the runner's client, so the call is service_role.
// One email per failed job (Q-0068 (a)): the fingerprint is the tenant and the job id.
export async function reportJobFailure(
  job: Pick<JobRow, 'id' | 'tenant_id' | 'project_id' | 'kind' | 'error' | 'attempts'>,
  deps: { db: SupabaseClient<Database>; env?: Env },
): Promise<ReportResult> {
  const env = deps.env ?? process.env;
  try {
    const code = job.error ?? 'unknown';
    const outcome = await recordAndAlert(
      deps.db,
      {
        kind: 'job_failed',
        source: 'job',
        fingerprint: await sha256Hex(`job_failed\n${job.tenant_id}\n${job.id}`),
        title: `${job.kind}: ${code}`.slice(0, 300),
        ref: job.id,
        tenantId: job.tenant_id,
        projectId: job.project_id,
        params: {
          kind: 'job_failed',
          jobKind: job.kind,
          attempts: job.attempts,
          error: code,
          jobId: job.id,
          projectId: job.project_id,
        },
      },
      env,
    );
    return { sentryEventId: null, ...outcome };
  } catch {
    return { sentryEventId: null, alert: 'store_unavailable', alertId: null };
  }
}

// A webhook delivery that used up its retries (EZD-1301 calls it). `db` must be the runner's client. One
// email per failed delivery (Q-0068 (a)). A name that is not a registered webhook event is a caller bug.
export async function reportWebhookFailure(input: {
  db: SupabaseClient<Database>;
  tenantId: string;
  projectId: string | null;
  eventName: string;
  eventId: string;
  attempts: number;
  lastStatus: number | string;
  env?: Env;
}): Promise<ReportResult> {
  if (!isRegisteredEvent(input.eventName) || EVENTS[input.eventName].kind !== 'webhook') {
    throw new TypeError('not_a_webhook_event');
  }
  const env = input.env ?? process.env;
  try {
    const outcome = await recordAndAlert(
      input.db,
      {
        kind: 'webhook_failed',
        source: 'webhook',
        fingerprint: await sha256Hex(`webhook_failed\n${input.tenantId}\n${input.eventId}`),
        title: `${input.eventName}: ${input.lastStatus}`.slice(0, 300),
        ref: input.eventId,
        tenantId: input.tenantId,
        projectId: input.projectId,
        params: {
          kind: 'webhook_failed',
          event: input.eventName,
          eventId: input.eventId,
          attempts: input.attempts,
          status: input.lastStatus,
        },
      },
      env,
    );
    return { sentryEventId: null, ...outcome };
  } catch {
    return { sentryEventId: null, alert: 'store_unavailable', alertId: null };
  }
}

// An event that already went through the tunnel (Step 7): the same recording and email path, no new capture.
export async function noteBrowserEvent(
  event: {
    event_id?: string;
    exception?: { values?: Array<{ type?: unknown; value?: unknown }> };
    message?: unknown;
    request?: { url?: unknown };
  },
  source: 'browser' | 'worker',
  deps: { env?: Env } = {},
): Promise<ReportResult> {
  const env = deps.env ?? process.env;
  const eventId = typeof event.event_id === 'string' ? event.event_id : null;
  try {
    const first = event.exception?.values?.[0];
    const type = typeof first?.type === 'string' && first.type ? first.type : 'NonError';
    const message =
      typeof first?.value === 'string'
        ? first.value
        : typeof event.message === 'string'
          ? event.message
          : '';
    const where =
      source === 'worker'
        ? 'worker'
        : typeof event.request?.url === 'string'
          ? event.request.url
          : '';
    const location = normalizeLocation(source, where);
    const fingerprint = await errorFingerprint({ source, type, message, location });
    const title = errorTitle(type, message);
    const outcome = await recordAndAlert(
      alertStoreClient(),
      {
        kind: 'error',
        source,
        fingerprint,
        title,
        ref: eventId,
        tenantId: null,
        projectId: null,
        params: { kind: 'error', title, source, location, eventId },
      },
      env,
    );
    return { sentryEventId: eventId, ...outcome };
  } catch {
    return { sentryEventId: eventId, alert: 'store_unavailable', alertId: null };
  }
}
