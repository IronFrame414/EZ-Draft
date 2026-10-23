// EZD-009 T2 (a)(b), T3, T4, T5, T10, T11, T12 and the SQL half of T20 (vault/plans/EZD-009.md Tests), local
// stack. Holds the shared job-queue lock (Step 8) so the unscoped sweep tests in sweep.db.test.ts never see
// this file's due jobs; afterEach removes its jobs. Expected values: the plan's Tests table, derived from its
// inputs, Q-0059 (a) and the migrations' contract (Steps 1-3). Sessions come from signIn().serverDb (EZD-006).
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { auditRls } from '../../../test-harness/rls/audit';
import { TABLE_GRANTS } from '../../../test-harness/rls/table-grants';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { JOB_KINDS } from '../../lib/jobs/kinds';
import { createJobsDbClient } from './db';
import { enqueueJob } from './enqueue';
import { JobError } from './errors';
import { testJobHandler } from './handlers/test-job';
import { createJobQueue } from './queue';
import { runJobs } from './runner';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type Row = Record<string, unknown>;

describe('EZD-009 job queue on the local stack', () => {
  let tenantA = '';
  let p1 = '';
  let p2 = '';
  let o: Member;
  let s: Member;
  let oSession: Session;
  let sSession: Session;
  let queue: ReturnType<typeof createJobsDbClient>;

  async function insertJob(row: Row = {}): Promise<Row & { id: string }> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tenantA,
        kind: 'test',
        payload: { steps: 1, stepMs: 0 },
        max_attempts: 3,
        ...row,
      })
      .select('*')
      .single();
    expect(error, 'admin insert into job').toBeNull();
    return data as Row & { id: string };
  }

  async function jobRow(id: string): Promise<Row> {
    const { data, error } = await adminDb().from('job').select('*').eq('id', id).single();
    expect(error).toBeNull();
    return data as Row;
  }

  async function jobCount(): Promise<number> {
    const { count, error } = await adminDb()
      .from('job')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantA);
    expect(error).toBeNull();
    return count ?? 0;
  }

  async function claim(runId: string, leaseSeconds: number) {
    return queue.rpc('job_claim', {
      p_run_id: runId,
      p_lease_seconds: leaseSeconds,
      p_only_tenant: tenantA,
    });
  }

  const deleteJobs = async () => {
    if (tenantA) await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
  };

  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await holdJobQueueShared();
    queue = createJobsDbClient();
    tenantA = await createTenant();
    [p1, p2] = await createProjects(tenantA, 2);
    o = await createMember({ tenantId: tenantA, scope: 'all' });
    s = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1] });
    oSession = await signIn(o.email);
    sSession = await signIn(s.email);
  }, 180000);

  afterEach(async () => {
    vi.unstubAllEnvs();
    await deleteJobs();
  });

  afterAll(async () => {
    await deleteJobs();
    await cleanup();
    await closeHarness();
    await release?.();
  });

  it('EZD-009 T2 (a) done when: two workers started at once run the job once (8 concurrent claims) @smoke', async () => {
    const job = await insertJob({ project_id: p1 });
    const results = await Promise.all(Array.from({ length: 8 }, () => claim(randomUUID(), 30)));
    for (const r of results) expect(r.error).toBeNull();
    const rows = results.flatMap((r) => (r.data ?? []) as Row[]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(job.id);
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].status).toBe('running');
  });

  it('EZD-009 T2 (b) done when: two runJobs started at once run the job once @smoke', async () => {
    const job = await insertJob({ project_id: p1 });
    const spy = { ...testJobHandler, run: vi.fn(testJobHandler.run) };
    const go = () =>
      runJobs({ queue: createJobQueue(queue), onlyTenantId: tenantA, handlers: { test: spy } });
    const [r1, r2] = await Promise.all([go(), go()]);
    expect(spy.run).toHaveBeenCalledTimes(1);
    expect(r1.claimed + r2.claimed).toBe(1);
    const row = await jobRow(job.id);
    expect(row.status).toBe('done');
    expect(row.attempts).toBe(1);
    expect(row.result).toEqual({ steps: 1 });
  });

  it('EZD-009 T3 done when: a job whose run dies is picked up again after its lease expires', async () => {
    const job = await insertJob({ project_id: p1 });
    const runA = randomUUID();
    expect(((await claim(runA, 2)).data as Row[]).length).toBe(1);
    const spy = { ...testJobHandler, run: vi.fn(testJobHandler.run) };
    const go = () =>
      runJobs({ queue: createJobQueue(queue), onlyTenantId: tenantA, handlers: { test: spy } });
    const first = await go();
    expect(first.claimed).toBe(0);
    expect(spy.run).toHaveBeenCalledTimes(0);
    const running = await jobRow(job.id);
    expect(running.status).toBe('running');
    expect(running.run_id).toBe(runA);

    await sleep(2500);
    await go();
    expect(spy.run).toHaveBeenCalledTimes(1);
    const done = await jobRow(job.id);
    expect(done.status).toBe('done');
    expect(done.attempts).toBe(2);
    expect(done.error).toBeNull();
    expect(done.result).toEqual({ steps: 1 });
    const late = await queue.rpc('job_complete', {
      p_job_id: job.id,
      p_run_id: runA,
      p_result: { steps: 9 },
    });
    expect(late.data).toBe(false);
    expect((await jobRow(job.id)).result).toEqual({ steps: 1 });

    const second = await insertJob({ project_id: p1, max_attempts: 1 });
    expect(((await claim(randomUUID(), 2)).data as Row[]).length).toBe(1);
    await sleep(2500);
    const spy2 = { ...testJobHandler, run: vi.fn(testJobHandler.run) };
    const onJobFailed = vi.fn();
    await runJobs({
      queue: createJobQueue(queue),
      onlyTenantId: tenantA,
      handlers: { test: spy2 },
      onJobFailed,
    });
    const failed = await jobRow(second.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('lease_expired');
    expect(failed.attempts).toBe(1);
    expect(spy2.run).toHaveBeenCalledTimes(0);
    expect(onJobFailed).toHaveBeenCalledTimes(1);
    expect(onJobFailed.mock.calls[0][0].id).toBe(second.id);
  });

  it('EZD-009 T4 every write after the claim is fenced by run_id', async () => {
    const job = await insertJob({ project_id: p1 });
    const runA = randomUUID();
    const runB = randomUUID();
    expect(((await claim(runA, 2)).data as Row[]).length).toBe(1);
    await sleep(2500);
    expect(((await claim(runB, 30)).data as Row[]).length).toBe(1);

    const progress = await queue.rpc('job_progress', {
      p_job_id: job.id,
      p_run_id: runA,
      p_progress: 50,
    });
    const cont = await queue.rpc('job_continue', {
      p_job_id: job.id,
      p_run_id: runA,
      p_state: { next: 1 },
    });
    const fail = await queue.rpc('job_fail', {
      p_job_id: job.id,
      p_run_id: runA,
      p_error: 'handler_failed',
      p_retry_after_ms: 1000,
    });
    expect(progress.data).toBe(false);
    expect(cont.data).toBe(false);
    expect(fail.data).toBe(false);
    const row = await jobRow(job.id);
    expect(row.run_id).toBe(runB);
    expect(row.progress).toBe(0);
    expect(row.state).toBeNull();
    expect(row.status).toBe('running');
  });

  it('EZD-009 T5 retry with backoff: queued with a wait, then done on the second try', async () => {
    const job = await insertJob({
      project_id: p1,
      payload: { steps: 1, stepMs: 0, failFirst: 1 },
    });
    const go = () =>
      runJobs({
        queue: createJobQueue(queue),
        onlyTenantId: tenantA,
        config: { backoff: { baseMs: 1000, capMs: 2000 } },
      });
    await go();
    const retry = await jobRow(job.id);
    expect(retry.status).toBe('queued');
    expect(retry.attempts).toBe(1);
    expect(retry.error).toBe('handler_failed');
    const gap = Date.parse(retry.run_after as string) - Date.parse(retry.updated_at as string);
    expect(gap).toBeGreaterThanOrEqual(1000);
    expect(gap).toBeLessThan(2000);
    expect((await go()).claimed).toBe(0);
    await sleep(1200);
    await go();
    const done = await jobRow(job.id);
    expect(done.status).toBe('done');
    expect(done.attempts).toBe(2);
    expect(done.error).toBeNull();
  });

  it('EZD-009 T10 enqueue: tenant and project scope, checks, defaults and one kick', async () => {
    const kick = vi.fn();
    const payload = { steps: 2, stepMs: 0 };

    // o (all projects) enqueues on P1
    const made = await enqueueJob(
      oSession.serverDb,
      { kind: 'test', projectId: p1, payload },
      { kick },
    );
    const row = await jobRow(made.id);
    expect(row.tenant_id).toBe(tenantA);
    expect(row.project_id).toBe(p1);
    expect(row.status).toBe('queued');
    expect(row.progress).toBe(0);
    expect(row.attempts).toBe(0);
    expect(row.max_attempts).toBe(5);
    expect(row.created_by).toBe(o.appUserId);
    expect(Date.parse(row.run_after as string)).toBeLessThanOrEqual(
      Date.parse(row.created_at as string) + 1000,
    );
    expect(kick).toHaveBeenCalledTimes(1);
    expect(await jobCount()).toBe(1);

    // s (listed: P1) cannot enqueue on P2
    const kickS = vi.fn();
    await expect(
      enqueueJob(sSession.serverDb, { kind: 'test', projectId: p2, payload }, { kick: kickS }),
    ).rejects.toMatchObject({ code: '42501' });
    expect(kickS).toHaveBeenCalledTimes(0);
    expect(await jobCount()).toBe(1);

    // bad payload and a large field are refused by the helper, before any row
    const kickBad = vi.fn();
    const zero = await enqueueJob(
      oSession.serverDb,
      { kind: 'test', projectId: p1, payload: { steps: 0, stepMs: 0 } },
      { kick: kickBad },
    ).catch((e: unknown) => e);
    expect(zero).toBeInstanceOf(JobError);
    expect(zero).toMatchObject({ code: 'invalid_payload' });
    const bigPayload = { ...payload, note: 'x'.repeat(20000) };
    const big = await enqueueJob(
      oSession.serverDb,
      { kind: 'test', projectId: p1, payload: bigPayload },
      { kick: kickBad },
    ).catch((e: unknown) => e);
    expect(big).toBeInstanceOf(JobError);
    expect(big).toMatchObject({ code: 'invalid_payload' });
    expect(kickBad).toHaveBeenCalledTimes(0);
    expect(await jobCount()).toBe(1);

    // direct RPC: the table check refuses a large payload and 6 attempts; s cannot enqueue tenant-level
    const large = await oSession.serverDb.rpc('enqueue_job', {
      p_kind: 'test',
      p_project_id: p1,
      p_payload: { ...payload, note: 'x'.repeat(20000) },
      p_max_attempts: 3,
    });
    expect(large.error?.code).toBe('23514');
    const six = await oSession.serverDb.rpc('enqueue_job', {
      p_kind: 'test',
      p_project_id: p1,
      p_payload: payload,
      p_max_attempts: 6,
    });
    expect(six.error?.code).toBe('23514');
    const tenantLevel = await sSession.serverDb.rpc('enqueue_job', {
      p_kind: 'test',
      p_project_id: null,
      p_payload: payload,
      p_max_attempts: 3,
    });
    expect(tenantLevel.error?.code).toBe('42501');
    expect(await jobCount()).toBe(1);
  });

  it('EZD-009 T11 row access: a listed member sees only its project; members cannot write or claim', async () => {
    const j1 = await insertJob({ project_id: p1 });
    const j2 = await insertJob({ project_id: p2 });
    const jt = await insertJob({});
    const seen = await sSession.serverDb.from('job').select('id');
    expect(seen.error).toBeNull();
    expect((seen.data ?? []).map((r) => r.id)).toEqual([j1.id]);
    expect(j2.id).not.toBe(j1.id);
    expect(jt.id).not.toBe(j1.id);

    const before = await jobRow(j1.id);
    const ins = await oSession.serverDb.from('job').insert({
      tenant_id: tenantA,
      project_id: p1,
      kind: 'test',
      payload: { steps: 1, stepMs: 0 },
      max_attempts: 3,
    });
    expect(ins.error?.code).toBe('42501');
    const upd = await oSession.serverDb.from('job').update({ status: 'failed' }).eq('id', j1.id);
    expect(upd.error?.code).toBe('42501');
    const del = await oSession.serverDb.from('job').delete().eq('id', j1.id);
    expect(del.error?.code).toBe('42501');
    expect(await jobRow(j1.id)).toEqual(before);
    expect(await jobCount()).toBe(3);

    const claimed = await oSession.serverDb.rpc('job_claim', {
      p_run_id: randomUUID(),
      p_lease_seconds: 30,
    });
    expect(claimed.error?.code).toBe('42501');
    const completed = await oSession.serverDb.rpc('job_complete', {
      p_job_id: j1.id,
      p_run_id: randomUUID(),
      p_result: {},
    });
    expect(completed.error?.code).toBe('42501');

    const anon = await anonDb({ gate: true }).from('job').select('id');
    expect(anon.error?.code).toBe('42501');
  });

  it('EZD-009 T12 function and table privileges, the audit, and the grant text', async () => {
    const sql = harnessSql();
    const can = async (role: string, signature: string) =>
      (await sql`select has_function_privilege(${role}, ${signature}, 'execute') as ok`)[0]
        .ok as boolean;
    const enqueue = 'public.enqueue_job(text, uuid, jsonb, integer, timestamptz)';
    expect(await can('authenticated', enqueue)).toBe(true);
    expect(await can('anon', enqueue)).toBe(false);
    const queueFunctions = [
      'public.job_claim(uuid, integer, uuid)',
      'public.job_fail_expired(uuid)',
      'public.job_progress(uuid, uuid, integer)',
      'public.job_complete(uuid, uuid, jsonb)',
      'public.job_continue(uuid, uuid, jsonb)',
      'public.job_fail(uuid, uuid, text, integer)',
    ];
    for (const fn of queueFunctions) {
      expect(await can('service_role', fn), fn).toBe(true);
      expect(await can('anon', fn), fn).toBe(false);
      expect(await can('authenticated', fn), fn).toBe(false);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(await can(role, 'private.job_broadcast()'), role).toBe(false);
    }

    expect(await auditRls(sql, { repoRoot })).toEqual([]);
    expect(TABLE_GRANTS.job.privileges).toEqual(['SELECT']);
    expect(TABLE_GRANTS.job.reason.trim().length).toBeGreaterThan(0);
    const table = async (role: string, priv: string) =>
      (await sql`select has_table_privilege(${role}, 'public.job', ${priv}) as ok`)[0]
        .ok as boolean;
    expect(await table('authenticated', 'SELECT')).toBe(true);
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(await table('authenticated', priv), priv).toBe(false);
    }
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(await table('service_role', priv), priv).toBe(true);
    }
  });

  it('EZD-009 T20 the kind check constraint holds exactly JOB_KINDS', async () => {
    const rows = await harnessSql()<{ def: string }[]>`
      select pg_get_constraintdef(oid) as def
      from pg_constraint
      where conrelid = 'public.job'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%'`;
    expect(rows).toHaveLength(1);
    const values = [...rows[0].def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    expect(values).toEqual([...JOB_KINDS].sort());
  });

  // Last in the file: its rows live in its own tenants and are removed by the helper's afterAll.
  describeTenantIsolation('job', {
    makeRow: (t) => ({
      tenant_id: t,
      kind: 'test',
      payload: { steps: 1, stepMs: 0 },
      max_attempts: 3,
    }),
  });
});
