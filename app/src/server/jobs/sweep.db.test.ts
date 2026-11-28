// EZD-009 T2 (c) and T15 (vault/plans/EZD-009.md Tests; Step 8), local stack: the unscoped sweep route. The
// sweep claims any due job in any tenant, so this file holds the exclusive job-queue lock before creating a
// row: no other file has a due job while it runs, and T15's { ran: 0 } and T2 (c)'s sum of 1 hold.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueExclusive } from '../../../test-harness/jobs/queue-lock';
import {
  adminDb,
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../test-harness/rls/fixtures';
import { GET as sweep } from '../../app/api/jobs/sweep/route';

// EZD-2020: the tunnel alert digest pass would stamp error_alert rows of files that hold the error-alert lock;
// this file tests the job run only, so the pass is mocked.
vi.mock('./tunnel-alert-digest', () => ({
  sweepTunnelAlertDigest: vi.fn(async () => ({ status: 'none', count: 0 })),
}));
// EZD-2041: the daily version cleanup pass (EZD-123) queues a `cleanup` job, from 08:00 UTC, for every company
// that has a working version and no cleanup job yet that day. Files that make versions but no jobs do not hold
// the job-queue lock, so the real pass queued jobs for their companies and this file's sweeps ran them: T2 (c)
// saw ran 2 and T15 ran 1 at random. This file tests the job run only, so the pass is mocked; it is tested in
// cleanup.db.test.ts and cleanup-enqueue-race.db.test.ts.
// AC-EZD-2041-2: with the pass mocked, this file passes repeated runs alongside the other database test files
// (20 runs in a row beside all of them when this was fixed).
vi.mock('../versions/cleanup-sweep', () => ({
  sweepVersionCleanup: vi.fn(async () => 0),
}));

describe('EZD-009 sweep route on the local stack', () => {
  let tenantA = '';
  let projectId = '';
  let otherTenant = '';
  let release: () => Promise<void>;

  const deleteJobs = async () => {
    if (tenantA) await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
    if (otherTenant)
      await harnessSql()`delete from public.job where tenant_id = ${otherTenant}::uuid`;
  };

  beforeAll(async () => {
    release = await holdJobQueueExclusive();
    tenantA = await createTenant();
    [projectId] = await createProjects(tenantA, 1);
    // EZD-2041: another company with a working version, as other test files have while this one runs. From
    // 08:00 UTC the real cleanup pass would queue a `cleanup` job for it on the first sweep of the day, and the
    // sweeps below would run it.
    otherTenant = await createTenant();
    const [otherProject] = await createProjects(otherTenant, 1);
    await harnessSql()`
      insert into public.model_version (project_id, tenant_id, model_json, schema_version, created_at)
      values (${otherProject}::uuid, ${otherTenant}::uuid, '{"objects":[]}'::jsonb, 1, now())`;
  }, 180000);

  afterEach(async () => {
    vi.unstubAllEnvs();
    await deleteJobs();
  });

  afterAll(async () => {
    try {
      await deleteJobs();
      await cleanup();
      await closeHarness();
    } finally {
      await release?.();
    }
  });

  // AC-EZD-2041-1: two sweeps started at once run one due job exactly once (ran sums to 1, status done,
  // attempts 1) while another company has a working version, as other database test files do in parallel.
  it('EZD-009 T2 (c) done when: two sweeps started at once run the job once @smoke', async () => {
    vi.stubEnv('CRON_SECRET', 'x'.repeat(40));
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tenantA,
        project_id: projectId,
        kind: 'test',
        payload: { steps: 1, stepMs: 0 },
        max_attempts: 3,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    const request = () =>
      new Request('http://localhost/api/jobs/sweep', {
        headers: { authorization: `Bearer ${'x'.repeat(40)}` },
      });
    const [r1, r2] = await Promise.all([sweep(request()), sweep(request())]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const ran =
      ((await r1.json()) as { ran: number }).ran + ((await r2.json()) as { ran: number }).ran;
    expect(ran).toBe(1);
    const row = (await adminDb().from('job').select('*').eq('id', id).single()).data as Record<
      string,
      unknown
    >;
    expect(row.status).toBe('done');
    expect(row.attempts).toBe(1);
    // EZD-2041: the two sweeps queued and ran nothing for the other company.
    const others = await harnessSql()`
      select 1 from public.job where tenant_id = ${otherTenant}::uuid`;
    expect(others).toHaveLength(0);
  });

  it('EZD-009 T15 sweep route: 401 without the right secret, 200 { ran: 0 } with it', async () => {
    const unauthorized = { error: { code: 'not_authorized', message_key: 'error.not_authorized' } };
    const secret = 'right-secret-'.repeat(4);
    const get = (authorization?: string) =>
      sweep(
        new Request(
          'http://localhost/api/jobs/sweep',
          authorization === undefined ? {} : { headers: { authorization } },
        ),
      );

    vi.stubEnv('CRON_SECRET', secret);
    for (const header of [undefined, 'Bearer wrong']) {
      const res = await get(header);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(unauthorized);
    }

    // CRON_SECRET empty, and CRON_SECRET unset, each with an empty bearer value.
    vi.stubEnv('CRON_SECRET', '');
    const empty = await get('Bearer ');
    expect(empty.status).toBe(401);
    expect(await empty.json()).toEqual(unauthorized);
    vi.stubEnv('CRON_SECRET', undefined);
    const unset = await get('Bearer ');
    expect(unset.status).toBe(401);
    expect(await unset.json()).toEqual(unauthorized);

    vi.stubEnv('CRON_SECRET', secret);
    const ok = await get(`Bearer ${secret}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ran: 0 });
    expect(ok.headers.get('cache-control') ?? '').toContain('no-store');
  });
});
