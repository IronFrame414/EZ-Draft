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

describe('EZD-009 sweep route on the local stack', () => {
  let tenantA = '';
  let projectId = '';
  let release: () => Promise<void>;

  const deleteJobs = async () => {
    if (tenantA) await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
  };

  beforeAll(async () => {
    release = await holdJobQueueExclusive();
    tenantA = await createTenant();
    [projectId] = await createProjects(tenantA, 1);
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
