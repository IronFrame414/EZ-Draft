// EZD-110a T9 (vault/plans/EZD-110a.md section 4; AC-EZD-110-5). Local stack, stub email transport. Holds the
// shared job-queue lock; every runJobs call passes onlyTenantId (ARCH Background jobs). Expected values:
// Decided D5 (handler outcomes, emailed_at, retry code), D6 (project line), section 6 (subject, link), the
// appOrigin local value http://localhost:3000, and the EZD-009 retry rules (Q-0413).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { expectSafeToRunTwice } from '../../../test-harness/jobs/run-twice';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { getHandlers } from './handlers';
import { runJobs } from './runner';

type JobRow = {
  id: string;
  status: string;
  error: string | null;
  result: unknown;
  attempts: number;
};

describe('EZD-110a notification_email job', () => {
  let release: () => Promise<void>;
  let tenant = '';
  let project = '';
  let m: Member;

  const createNotification = async (user: string): Promise<string> =>
    (
      await harnessSql()<{ id: string }[]>`
        select private.create_notification(${tenant}::uuid, ${user}::uuid, 'render_finished',
          ${project}::uuid, '{}'::jsonb, '/') as id`
    )[0].id;

  const jobOf = async (notificationId: string): Promise<JobRow> =>
    (
      await harnessSql()<JobRow[]>`
        select id, status, error, result, attempts from public.job
        where kind = 'notification_email' and payload ->> 'notificationId' = ${notificationId}`
    )[0];

  const emailedAt = async (id: string) =>
    (
      await harnessSql()<{ emailed_at: Date | null }[]>`
        select emailed_at from public.notification where id = ${id}::uuid`
    )[0].emailed_at;

  const messagesTo = (email: string) => readStubOutbox().filter((x) => x.to === email);

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    const sql = harnessSql();
    const [{ id: customer }] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Client A', 't9-client@example.test') returning id`;
    await sql`update public.project set name = 'Kitchen remodel', customer_id = ${customer}::uuid where id = ${project}::uuid`;
    m = await createMember({ tenantId: tenant, scope: 'all' });
  }, 180000);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    try {
      if (tenant) await harnessSql()`delete from public.job where tenant_id = ${tenant}::uuid`;
      await cleanup();
      await closeHarness();
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-110a T9 the job sends one email with the title, project line and link, and a second run sends nothing', async () => {
    clearStubOutbox();
    const id = await createNotification(m.appUserId);
    await runJobs({ onlyTenantId: tenant });

    const sent = messagesTo(m.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Photoreal render finished');
    expect(sent[0].text).toContain('Kitchen remodel · Client A');
    expect(sent[0].text).toContain('http://localhost:3000/');
    expect(await emailedAt(id)).not.toBeNull();
    const job = await jobOf(id);
    expect(job.status).toBe('done');
    expect(job.result).toEqual({ emailed: true });

    await expectSafeToRunTwice('notification_email', {
      payload: { notificationId: id },
      job: { id: job.id, tenant_id: tenant },
    });
    expect(messagesTo(m.email)).toHaveLength(1);

    // D5: emailed_at already set -> { emailed: true } with no send.
    const handler = getHandlers().notification_email;
    if (!handler) throw new Error('notification_email handler is not registered');
    const outcome = await handler.run({
      job: {
        id: job.id,
        tenant_id: tenant,
        project_id: null,
        kind: 'notification_email',
        attempts: 1,
      },
      payload: handler.payload.parse({ notificationId: id }),
      state: null,
      progress: async () => {},
      timeLeft: () => Number.MAX_SAFE_INTEGER,
      sleep: async () => {},
      signal: new AbortController().signal,
    } as never);
    expect(outcome).toEqual({ done: { emailed: true } });
    expect(messagesTo(m.email)).toHaveLength(1);
  }, 120000);

  it('EZD-110a T9 with no email transport the job stays queued with email_transport_not_set and emailed_at null', async () => {
    clearStubOutbox();
    const id = await createNotification(m.appUserId);
    vi.stubEnv('EMAIL_TRANSPORT', '');
    await runJobs({ onlyTenantId: tenant });

    const job = await jobOf(id);
    expect(job.status).toBe('queued');
    expect(job.error).toBe('email_transport_not_set');
    expect(await emailedAt(id)).toBeNull();
    expect(messagesTo(m.email)).toHaveLength(0);
  }, 120000);

  it('EZD-110a T9 a deactivated member gets no email and the job reports emailed false', async () => {
    clearStubOutbox();
    const gone = await createMember({ tenantId: tenant, scope: 'all' });
    const id = await createNotification(gone.appUserId);
    await harnessSql()`update public.membership set status = 'deactivated' where id = ${gone.membershipId}::uuid`;
    await runJobs({ onlyTenantId: tenant });

    const job = await jobOf(id);
    expect(job.status).toBe('done');
    expect(job.result).toEqual({ emailed: false });
    expect(messagesTo(gone.email)).toHaveLength(0);
    expect(await emailedAt(id)).toBeNull();
  }, 120000);
});
