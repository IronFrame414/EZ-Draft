// EZD-009 T6, T7, T8 (database half) and T13 (vault/plans/EZD-009.md Tests), local stack. Every runJobs call
// passes onlyTenantId = this file's fresh tenant (Step 8). Jobs are inserted with the admin client; T13
// enqueues through enqueueJob with a session client and a no-op kick. Expected values: the Tests table,
// derived from its inputs and the test handler's rules (Step 5).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFakeClock } from '../../../test-harness/jobs/fake-clock';
import {
  closeAllRealtime,
  connectRealtime,
  eventsNamed,
  QUIET_MS,
  sleep,
  waitFor,
  wasRefused,
} from '../../../test-harness/realtime/node-client';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { createJobsDbClient } from './db';
import { enqueueJob } from './enqueue';
import { testJobHandler } from './handlers/test-job';
import { createJobQueue } from './queue';
import { runJobs } from './runner';

type Row = Record<string, unknown>;

describe('EZD-009 job runner on the local stack', () => {
  let tenantA = '';
  let tenantB = '';
  let p1 = '';
  let p2 = '';
  let queue: ReturnType<typeof createJobQueue>;

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

  const deleteJobs = async () => {
    if (tenantA) await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
  };

  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await holdJobQueueShared();
    queue = createJobQueue(createJobsDbClient());
    tenantA = await createTenant();
    tenantB = await createTenant();
    [p1, p2] = await createProjects(tenantA, 2);
  }, 180000);

  afterEach(deleteJobs);

  afterAll(async () => {
    await closeAllRealtime();
    await deleteJobs();
    await cleanup();
    await closeHarness();
    await release?.();
  });

  it('EZD-009 T6 final failure: three tries, then failed, reported once', async () => {
    const job = await insertJob({
      project_id: p1,
      payload: { steps: 1, stepMs: 0, failFirst: 10 },
    });
    const spy = { ...testJobHandler, run: vi.fn(testJobHandler.run) };
    const onJobFailed = vi.fn();
    for (let i = 0; i < 6; i++) {
      await runJobs({
        queue,
        onlyTenantId: tenantA,
        handlers: { test: spy },
        config: { backoff: { baseMs: 1, capMs: 1 } },
        onJobFailed,
      });
      await sleep(20);
    }
    expect(spy.run).toHaveBeenCalledTimes(3);
    const row = await jobRow(job.id);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(3);
    expect(row.error).toBe('handler_failed');
    expect(row.finished_at).not.toBeNull();
    expect(onJobFailed).toHaveBeenCalledTimes(1);
    expect(onJobFailed.mock.calls[0][0].id).toBe(job.id);
  });

  it('EZD-009 T7 split to fit the time limit: three runs, one claim each', async () => {
    const job = await insertJob({ project_id: p1, payload: { steps: 5, stepMs: 2000 } });
    const clock = createFakeClock();
    const go = () =>
      runJobs({
        queue,
        onlyTenantId: tenantA,
        clock,
        config: { runBudgetMs: 5000, minClaimMs: 2500 },
      });

    const r1 = await go();
    expect(r1.claimed).toBe(1);
    let row = await jobRow(job.id);
    expect(row.status).toBe('queued');
    expect(row.state).toEqual({ next: 2 });
    expect(row.progress).toBe(40);
    expect(row.attempts).toBe(0);

    const r2 = await go();
    expect(r2.claimed).toBe(1);
    row = await jobRow(job.id);
    expect(row.state).toEqual({ next: 4 });
    expect(row.progress).toBe(80);

    const r3 = await go();
    expect(r3.claimed).toBe(1);
    row = await jobRow(job.id);
    expect(row.status).toBe('done');
    expect(row.progress).toBe(100);
    expect(row.result).toEqual({ steps: 5 });
    expect(row.attempts).toBe(1);
  });

  it('EZD-009 T8 bad input never retries', async () => {
    const bad = await insertJob({ project_id: p1, payload: { steps: 0, stepMs: 0 } });
    const foreign = await insertJob({
      project_id: p1,
      payload: {
        steps: 1,
        stepMs: 0,
        extra: { bucket: 'jobs', path: `${tenantB}/x/y` },
      },
    });
    const noHandler = await insertJob({ project_id: p1, kind: 'render', payload: {} });
    await runJobs({ queue, onlyTenantId: tenantA });
    for (const job of [bad, foreign]) {
      const row = await jobRow(job.id);
      expect(row.status).toBe('failed');
      expect(row.error).toBe('invalid_payload');
      expect(row.attempts).toBe(1);
    }
    const row = await jobRow(noHandler.id);
    expect(row.status).toBe('failed');
    expect(row.error).toBe('no_handler');
  });

  it('EZD-009 T13 progress reaches the project channel, only for members who can join it', async () => {
    const a = await createMember({ tenantId: tenantA, scope: 'all' });
    const s = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p2] });
    const aSession = await signIn(a.email);
    const sSession = await signIn(s.email);
    const aRt = await connectRealtime(aSession.accessToken);
    const sRt = await connectRealtime(sSession.accessToken);
    const aP1 = aRt.join(`project:${p1}`);
    const aP2 = aRt.join(`project:${p2}`);
    const sP1 = sRt.join(`project:${p1}`);
    expect(await aP1.joined).toBe('SUBSCRIBED');
    expect(await aP2.joined).toBe('SUBSCRIBED');
    await sP1.joined;
    expect(wasRefused(sP1)).toBe(true);

    const { id } = await enqueueJob(
      aSession.serverDb,
      { kind: 'test', projectId: p1, payload: { steps: 2, stepMs: 0 } },
      { kick: () => {} },
    );
    await runJobs({ queue, onlyTenantId: tenantA });
    expect(await waitFor(() => eventsNamed(aP1, 'job.progress').length >= 5)).toBe(true);
    const seen = eventsNamed(aP1, 'job.progress').map((e) => e.payload as Row);
    expect(seen.map((p) => `${p.status}/${p.progress}`)).toEqual([
      'queued/0',
      'running/0',
      'running/50',
      'running/100',
      'done/100',
    ]);
    for (const payload of seen) {
      expect(Object.keys(payload).sort()).toEqual([
        'attempts',
        'jobId',
        'kind',
        'progress',
        'status',
      ]);
      expect(payload.jobId).toBe(id);
      expect(payload.kind).toBe('test');
    }

    // A tenant-level job sends nothing on either channel.
    const tenantLevel = await insertJob({ payload: { steps: 1, stepMs: 0 } });
    await runJobs({ queue, onlyTenantId: tenantA });
    expect((await jobRow(tenantLevel.id)).status).toBe('done');
    await sleep(QUIET_MS);
    expect(eventsNamed(aP1, 'job.progress')).toHaveLength(5);
    expect(eventsNamed(aP2, 'job.progress')).toHaveLength(0);
  });
});
