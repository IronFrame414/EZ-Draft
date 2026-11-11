// EZD-135 D1, D2 (vault/plans/EZD-135.md section 4; AC-EZD-135-2, AC-EZD-135-4). Local stack; the loaders run on a
// signed-in member's server client, so RLS (job_select, error_alert_select) is the only filter. Expected values:
// Q-0664 (failed jobs of the last 30 days, newest first, 50 per page; webhook_failed alerts of the tenant),
// Decided "Range past the last row", "Behaviour per role" (listed row). Locks as app/src/server/errors/
// jobs-webhooks.db.test.ts lines 88-114.
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { loadJobFailures, loadWebhookFailures } from './system-status';

const fp = () => randomBytes(32).toString('hex');

async function failedJob(
  tenant: string,
  minutesAgo: number,
  projectId: string | null = null,
): Promise<string> {
  const rows =
    await harnessSql()`insert into public.job (tenant_id, project_id, kind, status, attempts, max_attempts, error, finished_at) values (${tenant}::uuid, ${projectId}::uuid, 'test', 'failed', 5, 5, 'ezd135_probe_failed', now() - ${minutesAgo} * interval '1 minute') returning id`;
  return rows[0]!.id as string;
}

describe('EZD-135 system status lists (database)', () => {
  let releaseAlerts: () => Promise<void>;
  let releaseJobs: () => Promise<void>;
  let db: SupabaseClient<Database>;
  let dbL: SupabaseClient<Database>;
  const ids: string[] = [];
  let jobP1: string;

  beforeAll(async () => {
    releaseAlerts = await holdErrorAlertLock();
    releaseJobs = await holdJobQueueShared();
    await harnessSql()`delete from public.error_alert`;
    const sql = harnessSql();

    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['settings_system_status']);
    const s = await signIn(m.email);
    db = s.serverDb as unknown as SupabaseClient<Database>;
    const tenantB = await createTenant();

    for (let i = 1; i <= 52; i++) ids[i] = await failedJob(tenant, i);
    await sql`insert into public.job (tenant_id, kind, status, attempts, max_attempts, error, finished_at) values (${tenant}::uuid, 'test', 'failed', 5, 5, 'ezd135_probe_failed', now() - interval '31 days')`;
    await sql`insert into public.job (tenant_id, kind, status, attempts, max_attempts, finished_at) values (${tenant}::uuid, 'test', 'done', 1, 5, now())`;
    await failedJob(tenantB, 0);

    const alert = (
      t: string,
      kind: string,
      source: string,
      title: string,
      ref: string,
      occ: number,
      minutes: number,
    ) =>
      sql`insert into public.error_alert (tenant_id, kind, source, title, ref, occurrences, fingerprint, last_seen_at) values (${t}::uuid, ${kind}, ${source}, ${title}, ${ref}, ${occ}, ${fp()}, now() - ${minutes} * interval '1 minute')`;
    await alert(tenant, 'webhook_failed', 'webhook', 'project.updated: 500', 'evt-1', 1, 1);
    await alert(tenant, 'webhook_failed', 'webhook', 'project.updated: 503', 'evt-2', 3, 2);
    await alert(tenant, 'job_failed', 'job', 'test: ezd135_probe_failed', 'j-1', 1, 3);
    await alert(tenantB, 'webhook_failed', 'webhook', 'project.updated: 500', 'evt-9', 1, 0);

    // D2 (b): a listed member in tenant C.
    const tenantC = await createTenant();
    const [p1, p2] = await createProjects(tenantC, 2);
    const ml = await createMember({ tenantId: tenantC, scope: 'listed', listed: [p1!] });
    await setPermissions(tenantC, ml.membershipId, ['settings_system_status']);
    dbL = (await signIn(ml.email)).serverDb as unknown as SupabaseClient<Database>;
    jobP1 = await failedJob(tenantC, 0, p1!);
    await failedJob(tenantC, 0, p2!);
    await failedJob(tenantC, 0, null);
    for (const [pid, ref] of [
      [p1!, 'evt-p1'],
      [p2!, 'evt-p2'],
    ] as const) {
      await sql`insert into public.error_alert (tenant_id, project_id, kind, source, title, ref, occurrences, fingerprint) values (${tenantC}::uuid, ${pid}::uuid, 'webhook_failed', 'webhook', 'project.updated: 500', ${ref}, 1, ${fp()})`;
    }
  }, 180000);

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await cleanup();
      await closeHarness();
    } finally {
      await releaseJobs();
      await releaseAlerts();
    }
  }, 180000);

  it('D1 (a) page 1', async () => {
    const page = await loadJobFailures(db, 1);
    expect(page.total).toBe(52);
    expect(page.pageSize).toBe(50);
    expect(page.rows).toHaveLength(50);
    expect(page.rows.map((r) => r.id)).toEqual(ids.slice(1, 51));
    expect(page.rows[0]).toMatchObject({ kind: 'test', error: 'ezd135_probe_failed', attempts: 5 });
  });

  it('D1 (b) page 2 and past the end', async () => {
    const two = await loadJobFailures(db, 2);
    expect(two.total).toBe(52);
    expect(two.rows.map((r) => r.id)).toEqual([ids[51], ids[52]]);
    expect(await loadJobFailures(db, 3)).toEqual({ rows: [], total: 52, page: 3, pageSize: 50 });
  });

  it('D2 (a) webhook failures of the tenant', async () => {
    const page = await loadWebhookFailures(db, 1);
    expect(page.total).toBe(2);
    expect(page.rows.map((r) => r.ref)).toEqual(['evt-1', 'evt-2']);
    expect(page.rows.map((r) => r.occurrences)).toEqual([1, 3]);
    expect(page.rows.map((r) => r.title)).toEqual(['project.updated: 500', 'project.updated: 503']);
  });

  it('D2 (b) a listed member sees only failures on listed projects', async () => {
    const jobs = await loadJobFailures(dbL, 1);
    expect(jobs.total).toBe(1);
    expect(jobs.rows.map((r) => r.id)).toEqual([jobP1]);
    const hooks = await loadWebhookFailures(dbL, 1);
    expect(hooks.total).toBe(1);
    expect(hooks.rows.map((r) => r.ref)).toEqual(['evt-p1']);
  });
});
