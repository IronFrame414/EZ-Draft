// EZD-024 T10, T11 and T22 (vault/plans/EZD-024.md Tests; Steps 5 and 9; Re-validation V5, V6, V7), local
// stack. Takes the error-alert lock first and holdJobQueueShared() second, releases in reverse (V7); test jobs
// are inserted as in queue.db.test.ts insertJob and run with onlyTenantId (V6). Expected wording comes from the
// catalog (Q-0069 (a)); recipients from Q-0067 (b); one email per failed job or delivery from Q-0068 (a).
import { randomBytes } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { eventsIn } from '../../../test-harness/sentry-outbox';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { createJobsDbClient } from '../jobs/db';
import { defaultJobHooks } from '../jobs/default-hooks';
import { runJobs } from '../jobs/runner';
import type { JobRow } from '../jobs/registry';
import { getT } from '../messages/get-t';
import { ownerAlertRecipients } from './alert-recipients';
import { reportError, reportJobFailure, reportWebhookFailure } from './index';
import { initErrorReporting } from './sentry-options';
import { clearSentryStubOutbox, readSentryStubOutbox } from './test-harness/sentry-stub-transport';

const T = getT('office', 'en');
const nonce = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');
type Row = Record<string, unknown>;

describe('EZD-024 failed jobs, failed webhooks and alert recipients', () => {
  let releaseAlerts: () => Promise<void>;
  let releaseJobs: () => Promise<void>;
  const tenants: string[] = [];

  async function newTenant(): Promise<{ id: string; project: string }> {
    const id = await createTenant();
    tenants.push(id);
    const [project] = await createProjects(id, 1);
    return { id, project };
  }

  async function newMember(tenantId: string, rolePreset: string | null, status?: 'deactivated') {
    const m: Member = await createMember({ tenantId, scope: 'all', ...(status ? { status } : {}) });
    const { error } = await adminDb()
      .from('app_user')
      .update({ role_preset: rolePreset })
      .eq('id', m.appUserId);
    expect(error).toBeNull();
    return m;
  }

  // Inserts a `test` job that fails at once (max_attempts 1) and runs it to failure.
  async function failedJob(tenantId: string, projectId: string, withHooks: boolean) {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        kind: 'test',
        payload: { steps: 1, stepMs: 0, failFirst: 10 },
        max_attempts: 1,
      })
      .select('*')
      .single();
    expect(error, 'admin insert into job').toBeNull();
    const id = (data as Row).id as string;
    await runJobs({ ...(withHooks ? defaultJobHooks() : {}), onlyTenantId: tenantId });
    const read = await adminDb().from('job').select('*').eq('id', id).single();
    expect(read.error).toBeNull();
    const row = read.data as JobRow;
    expect(row.status).toBe('failed');
    expect(row.error).toBe('handler_failed');
    return row;
  }

  async function alertRowFor(ref: string): Promise<Row> {
    const { data, error } = await adminDb().from('error_alert').select('*').eq('ref', ref).single();
    expect(error).toBeNull();
    return data as Row;
  }

  beforeAll(async () => {
    releaseAlerts = await holdErrorAlertLock();
    releaseJobs = await holdJobQueueShared();
    await harnessSql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
  }, 180000);

  beforeEach(async () => {
    await harnessSql()`delete from public.error_alert`;
    clearStubOutbox();
    clearSentryStubOutbox();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      for (const t of tenants) await adminDb().from('job').delete().eq('tenant_id', t);
      await cleanup();
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await releaseJobs();
      await releaseAlerts();
    }
  }, 180000);

  it('EZD-024 T10 a job that finally fails emails ALERT_EMAIL_TO and the Owner once', async () => {
    const a = await newTenant();
    const ow = await newMember(a.id, 'owner');

    const job = await failedJob(a.id, a.project, true);
    await Sentry.flush(2000);
    const handlerEvents = eventsIn(readSentryStubOutbox()).filter(
      (e) => e.tags?.['ezd.source'] === 'job' && e.tags?.['ezd.location'] === 'test',
    );
    expect(handlerEvents).toHaveLength(1);
    const errorRows = await adminDb().from('error_alert').select('id').eq('kind', 'error');
    expect(errorRows.data).toEqual([]);

    const alert = await alertRowFor(job.id);
    expect(alert).toMatchObject({
      kind: 'job_failed',
      tenant_id: a.id,
      project_id: a.project,
      ref: job.id,
    });
    const sent = readStubOutbox();
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.to.toLowerCase()).sort()).toEqual(
      ['owner@example.test', ow.email.toLowerCase()].sort(),
    );
    for (const m of sent) {
      expect(m.subject).toBe(T('office.alert.job.subject', { kind: 'test' }));
      expect(m.text).toContain(job.id);
      expect(m.text).toContain('handler_failed');
    }
    expect(sent.map((m) => m.idempotencyKey).sort()).toEqual(
      [`alert-${alert.id}`, `alert-${alert.id}-${ow.appUserId}`].sort(),
    );
    expect(sent.find((m) => m.to === 'owner@example.test')?.idempotencyKey).toBe(
      `alert-${alert.id}`,
    );

    // the same failed job reported again sends nothing
    await reportJobFailure(job, { db: createJobsDbClient() });
    expect(readStubOutbox()).toHaveLength(2);

    // a second failed job of the same kind and error code: one more pair
    await failedJob(a.id, a.project, true);
    expect(readStubOutbox()).toHaveLength(4);
  });

  it('EZD-024 T11 a failed webhook delivery emails ALERT_EMAIL_TO and the Owner once per delivery', async () => {
    const a = await newTenant();
    const ow = await newMember(a.id, 'owner');
    const db = createJobsDbClient();
    const report = (eventName: string, eventId: string) =>
      reportWebhookFailure({
        db,
        tenantId: a.id,
        projectId: a.project,
        eventName,
        eventId,
        attempts: 5,
        lastStatus: 503,
      });

    await report('plan_set.issued', 'evt-1');
    const sent = readStubOutbox();
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.to.toLowerCase()).sort()).toEqual(
      ['owner@example.test', ow.email.toLowerCase()].sort(),
    );
    for (const m of sent) {
      expect(m.subject).toBe(T('office.alert.webhook.subject', { event: 'plan_set.issued' }));
      expect(m.text).toContain('evt-1');
      expect(m.text).toContain('503');
    }

    await report('plan_set.issued', 'evt-1');
    expect(readStubOutbox()).toHaveLength(2);
    await report('plan_set.issued', 'evt-2');
    expect(readStubOutbox()).toHaveLength(4);

    const before = (await adminDb().from('error_alert').select('id')).data?.length;
    for (const name of ['lock.acquired', 'not.registered']) {
      await expect((async () => report(name, 'evt-3'))()).rejects.toBeInstanceOf(TypeError);
    }
    expect(readStubOutbox()).toHaveLength(4);
    expect((await adminDb().from('error_alert').select('id')).data?.length).toBe(before);
  });

  it('EZD-024 T22 alert recipients: Owners of the job company, merged with ALERT_EMAIL_TO', async () => {
    const b = await newTenant();
    const o1 = await newMember(b.id, 'owner');
    const o2 = await newMember(b.id, 'owner');
    await newMember(b.id, 'owner', 'deactivated');
    await newMember(b.id, 'designer');
    await newMember(b.id, null);
    const c = await newTenant();
    await newMember(c.id, 'owner');
    const d = await newTenant();
    const db = createJobsDbClient();

    // (a)
    const expected = [o1, o2]
      .sort((x, y) => (x.appUserId < y.appUserId ? -1 : 1))
      .map((m) => ({ userId: m.appUserId, email: m.email }));
    expect(await ownerAlertRecipients(db, b.id)).toEqual(expected);

    // (b) ALERT_EMAIL_TO is o2's address in capitals: merged into one message
    vi.stubEnv('ALERT_EMAIL_TO', o2.email.toUpperCase());
    const job1 = await failedJob(b.id, b.project, false);
    const r1 = await reportJobFailure(job1, { db });
    expect(r1.alert).toBe('emailed');
    let sent = readStubOutbox();
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.to.toLowerCase()).sort()).toEqual(
      [o1.email.toLowerCase(), o2.email.toLowerCase()].sort(),
    );

    // (c) no ALERT_EMAIL_TO
    clearStubOutbox();
    vi.stubEnv('ALERT_EMAIL_TO', undefined);
    const job2 = await failedJob(b.id, b.project, false);
    const r2 = await reportJobFailure(job2, { db });
    expect(r2.alert).toBe('emailed');
    sent = readStubOutbox();
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.to.toLowerCase()).sort()).toEqual(
      [o1.email.toLowerCase(), o2.email.toLowerCase()].sort(),
    );

    // (d) a company with no Owner and no ALERT_EMAIL_TO: nobody to email, the claim is released
    clearStubOutbox();
    const job3 = await failedJob(d.id, d.project, false);
    const r3 = await reportJobFailure(job3, { db });
    expect(r3.alert).toBe('email_failed');
    expect(readStubOutbox()).toHaveLength(0);
    const row = await alertRowFor(job3.id);
    expect(row.emailed_at).toBeNull();
    expect(row.email_claim).toBeNull();

    // (e) an error alert goes to ALERT_EMAIL_TO only, never to an Owner
    vi.unstubAllEnvs();
    clearStubOutbox();
    const r4 = await reportError(new Error('EZD-024 recipients ' + nonce()), {
      source: 'function',
      location: '/api/r',
    });
    expect(r4.alert).toBe('emailed');
    sent = readStubOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('owner@example.test');
  });
});
