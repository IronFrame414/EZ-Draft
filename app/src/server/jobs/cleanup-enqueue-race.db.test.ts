// EZD-1611a gate fix (EZD-123 sweep; migration 20261126211000): a company deleted while the daily cleanup sweep runs
// does not fail the sweep. Before, the sweep's insert could name a company whose delete committed mid-statement and
// broke job_tenant_id_fkey (seen in the gate beside tests that delete their companies). Now the sweep waits for the
// delete and leaves that company out.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import {
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../test-harness/rls/fixtures';
import { createJobsDbClient } from './db';
import { enqueueVersionCleanupWith } from '../versions/cleanup';

// A day no other test's sweep uses.
const SLOT = '2031-02-07T08:00:00Z';

describe('EZD-123 sweep enqueue beside a company delete (database)', () => {
  let release: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    release = await holdJobQueueShared();
  }, 60000);

  afterAll(async () => {
    await harnessSql()`delete from public.job where kind = 'cleanup' and payload ->> 'at' = ${SLOT}`;
    await release?.();
    await cleanup();
    await closeHarness();
  });

  it('waits for the delete, queues no job for the deleted company and does not fail', async () => {
    const gone = await createTenant();
    const [p] = await createProjects(gone, 1);
    await harnessSql()`
      insert into public.model_version (project_id, tenant_id, model_json, schema_version, created_at)
      values (${p}::uuid, ${gone}::uuid, '{"objects":[]}'::jsonb, 1, '2026-10-01T00:00:00Z'::timestamptz)`;

    let deleted!: () => void;
    const hold = new Promise<void>((r) => (deleted = r));
    let sweep: Promise<number> | null = null;
    let settled = false;
    await harnessSql().begin(async (tx) => {
      // The company's delete, not yet committed.
      await tx`delete from public.membership where tenant_id = ${gone}::uuid`;
      await tx`delete from public.project where tenant_id = ${gone}::uuid`;
      await tx`delete from public.tenant where id = ${gone}::uuid`;
      sweep = enqueueVersionCleanupWith(
        createJobsDbClient(),
        new Date('2031-02-07T09:00:00Z'),
      ).finally(() => (settled = true));
      // The sweep is held by the open delete.
      await new Promise((r) => setTimeout(r, 1500));
      expect(settled).toBe(false);
      deleted();
    });
    await hold;
    await expect(sweep).resolves.toBeGreaterThanOrEqual(0);
    const jobs = await harnessSql()`
      select 1 from public.job where tenant_id = ${gone}::uuid`;
    expect(jobs).toHaveLength(0);
  }, 60000);
});
