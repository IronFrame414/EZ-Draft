// EZD-237 T16-T19 (vault/plans/EZD-237.md section 4; AC-EZD-237-1, -2). Pattern: benchmark-project.db.test.ts.
// Expected values: plan M1 as built (deny-all policy, the invite precedent: a direct read sees no row and a direct write is refused; tenant_id, created_by, run_at default), F1 (System
// status and Edit model, else 42501; a non-object device or results, or an app version outside 1 to 64
// characters, is 22023), F2 (newest first, 50 per page, the tenant's total; System status, else 42501; page
// below 1 is 22023); Q-0664 (benchmark_run adds tenant_id and created_by; readable with System status; 50 per page).
// Calls go through the gated serverDb of `signIn` (RLS applies); rows are read and seeded with harnessSql.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import { listBenchmarkRuns, recordBenchmarkRun } from './benchmark-runs';

const T = { timeout: 60_000 };
const FULL = ['view_projects', 'edit_model', 'settings_system_status'];
const DEVICE = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36',
  screen: { width: 1600, height: 1000 },
  devicePixelRatio: 1,
  hardwareConcurrency: 8,
  maxTouchPoints: 0,
};
const STEP = { frames: 180, meanMs: 6, p95Ms: 12, maxMs: 40, over100: 0 };
const RESULTS = { pan: STEP, zoom: STEP, drag: STEP, memory: null };

type Fix = { tenant: string; member: Member; db: Session['serverDb'] };

async function fixture(permissions: string[] = FULL): Promise<Fix> {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, permissions as never);
  const s = await signIn(member.email);
  return { tenant, member, db: s.serverDb };
}

const record = (db: Fix['db'], over: Record<string, unknown> = {}) =>
  db.rpc('record_benchmark_run', {
    p_device: DEVICE,
    p_app_version: 'dev-1730000000',
    p_results: RESULTS,
    ...over,
  });

describe('EZD-237 benchmark runs (database)', () => {
  let t: Fix;

  beforeAll(async () => {
    t = await fixture();
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-237 T16 record writes one row; refuses without a switch or with bad input', T, async () => {
    const { data, error } = await record(t.db);
    expect(error).toBeNull();
    const [row] = await harnessSql()<Record<string, unknown>[]>`
      select tenant_id, created_by, device, app_version, results, run_at
      from public.benchmark_run where id = ${data as string}::uuid`;
    expect(row).toMatchObject({
      tenant_id: t.tenant,
      created_by: t.member.appUserId,
      device: DEVICE,
      app_version: 'dev-1730000000',
      results: RESULTS,
    });
    expect(row!.run_at).toBeInstanceOf(Date);

    const noStatus = await fixture(['view_projects', 'edit_model']);
    expect((await record(noStatus.db)).error?.code).toBe('42501');
    const noEdit = await fixture(['view_projects', 'settings_system_status']);
    expect((await record(noEdit.db)).error?.code).toBe('42501');
    expect((await record(t.db, { p_app_version: '' })).error?.code).toBe('22023');
    expect((await record(t.db, { p_device: [] })).error?.code).toBe('22023');
  });

  it('EZD-237 T17 list: the tenant only, newest first, 50 per page, with the total', T, async () => {
    const f = await fixture();
    const other = await createTenant();
    const sql = harnessSql();
    const t0 = Date.parse('2026-11-01T00:00:00.000Z');
    for (let i = 0; i < 51; i++) {
      const at = new Date(t0 + i * 1000).toISOString();
      await sql`
        insert into public.benchmark_run (tenant_id, device, app_version, results, run_at)
        values (${f.tenant}::uuid, ${sql.json(DEVICE)}, ${`dev-${i + 1}`}, ${sql.json(RESULTS)}, ${at}::timestamptz)`;
    }
    for (let i = 0; i < 2; i++)
      await sql`
        insert into public.benchmark_run (tenant_id, device, app_version, results)
        values (${other}::uuid, ${sql.json(DEVICE)}, 'dev-0', ${sql.json(RESULTS)})`;

    type Page = { total: number; rows: { app_version: string; run_at: string }[] };
    const one = await f.db.rpc('list_benchmark_runs', { p_page: 1 });
    expect(one.error).toBeNull();
    const p1 = one.data as Page;
    expect(p1.total).toBe(51);
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows.map((r) => r.app_version)).toEqual(
      Array.from({ length: 50 }, (_, i) => `dev-${51 - i}`),
    );
    const p2 = (await f.db.rpc('list_benchmark_runs', { p_page: 2 })).data as Page;
    expect(p2.total).toBe(51);
    expect(p2.rows.map((r) => r.app_version)).toEqual(['dev-1']);

    const viewer = await fixture(['view_projects']);
    expect((await viewer.db.rpc('list_benchmark_runs', { p_page: 1 })).error?.code).toBe('42501');
    expect((await f.db.rpc('list_benchmark_runs', { p_page: 0 })).error?.code).toBe('22023');
  });

  describeTenantIsolation('benchmark_run', {
    makeRow: (tenantId) => ({
      tenant_id: tenantId,
      device: {},
      app_version: 'dev-0',
      results: {},
    }),
  });

  // The deny-all policy (the invite precedent): a direct read sees no row, a direct write is refused.
  it('EZD-237 T19 no direct table access, even with both switches', T, async () => {
    await record(t.db);
    const read = await t.db.from('benchmark_run').select('id');
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const write = await t.db
      .from('benchmark_run')
      .insert({ tenant_id: t.tenant, device: {}, app_version: 'dev-0', results: {} });
    expect(write.error?.code).toBe('42501');
  });
});

// D-Server: 42501 is permission_denied, 22023 invalid_input (write only), any other error is thrown, and a reply
// of the wrong shape throws benchmark_runs_bad_reply. A stub client stands in for the database.
describe('EZD-237 benchmark runs (server replies)', () => {
  const ID = '3f2b8c1e-5d4a-4c7e-9b1a-0e6d2f4a8c10';
  const stub = (data: unknown, error: { code: string } | null = null) =>
    ({ rpc: async () => ({ data, error }) }) as never;
  const INPUT = { device: DEVICE, appVersion: 'dev-1', results: RESULTS };

  it('EZD-237 record maps the database replies', async () => {
    expect(await recordBenchmarkRun(stub(ID), INPUT)).toEqual({ ok: true, id: ID });
    expect(await recordBenchmarkRun(stub(null, { code: '42501' }), INPUT)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await recordBenchmarkRun(stub(null, { code: '22023' }), INPUT)).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    await expect(recordBenchmarkRun(stub(null, { code: '08006' }), INPUT)).rejects.toEqual({
      code: '08006',
    });
    await expect(recordBenchmarkRun(stub('nope'), INPUT)).rejects.toThrow('benchmark_runs_bad_reply');
  });

  it('EZD-237 list maps rows and the database replies', async () => {
    const row = {
      id: ID,
      run_at: '2026-11-11T15:20:00+00:00',
      device: DEVICE,
      app_version: 'dev-1',
      results: RESULTS,
    };
    expect(await listBenchmarkRuns(stub({ total: 1, rows: [row] }), 1)).toEqual({
      ok: true,
      page: {
        rows: [{ id: ID, runAt: row.run_at, device: DEVICE, appVersion: 'dev-1', results: RESULTS }],
        total: 1,
        page: 1,
        pageSize: 50,
      },
    });
    expect(await listBenchmarkRuns(stub(null, { code: '42501' }), 1)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    await expect(listBenchmarkRuns(stub(null, { code: '22023' }), 1)).rejects.toEqual({
      code: '22023',
    });
    await expect(listBenchmarkRuns(stub({ total: 1, rows: [{ ...row, extra: 1 }] }), 1)).rejects.toThrow(
      'benchmark_runs_bad_reply',
    );
  });
});
