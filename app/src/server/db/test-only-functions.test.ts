// EZD-323 T1, T4-T8 (vault/plans/EZD-323.md sections 3 and 4; AC-EZD-323-1..3): the test-only database
// function rules. Local stack. T1 signs a member in and calls the function as a signed-in user would; T4-T7
// read the catalog and run the audit inside rolled-back transactions; T8 reads the source tree.
// The file inserts no job itself, but a refused call must create none, so it holds the shared job-queue lock.
// Expected values: the plan's Tests table (M1, D1, D6, D8, D9) and queue.db.test.ts 356-360 (42501).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { auditRls, type RlsProblem } from '../../../test-harness/rls/audit';
import { adminSql, withRollback, type Sql } from '../../../test-harness/rls/db';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { isTestOnlyName, TEST_ONLY_FUNCTIONS } from '../../../test-harness/rls/test-only-functions';

const appSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(appSrc, '..', '..');
const FN = 'public.send_test_notification(uuid, text, uuid, jsonb)';
const FOUR = [
  'anon_executes_test_only_function',
  'authenticated_executes_test_only_function',
  'test_only_function_unlisted',
  'test_only_function_stale',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
const isTestFile = (file: string) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) ||
  file.split(path.sep).some((part) => part === 'test-harness' || part === 'test-utils');
const rel = (file: string) => path.relative(repoRoot, file).split(path.sep).join('/');

const codes = (problems: RlsProblem[], fn: string) =>
  problems
    .filter((p) => p.table === fn)
    .map((p) => p.code)
    .sort();

describe('EZD-323 test-only database functions', () => {
  let release: () => Promise<void>;
  let sql: Sql;
  const tenants: string[] = [];

  beforeAll(async () => {
    release = await holdJobQueueShared();
    sql = adminSql();
  }, 180000);

  afterAll(async () => {
    try {
      for (const t of tenants)
        await harnessSql()`delete from public.job where tenant_id = ${t}::uuid`;
      await sql.end({ timeout: 5 });
      await cleanup();
      await closeHarness();
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-323 T1 a signed-in user is refused the test sender and nothing is created', async () => {
    const tenant = await createTenant();
    tenants.push(tenant);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    const s = await signIn(m.email);
    const args = {
      p_membership_id: m.membershipId,
      p_kind: 'render_finished',
      p_project_id: null,
      p_payload: {},
    };
    const a = await s.serverDb.rpc('send_test_notification', args);
    expect(a.error?.code).toBe('42501');
    const b = await s.browserDb.rpc('send_test_notification', args);
    expect(b.error?.code).toBe('42501');
    const c = await s.serverDb.rpc('send_test_notification', {
      p_kind: 'render_finished',
      p_project_id: null,
      p_payload: {},
    });
    expect(c.error).not.toBeNull();

    const counts = await harnessSql()<{ n: number; j: number }[]>`
      select (select count(*)::int from public.notification where user_id = ${m.appUserId}::uuid) as n,
        (select count(*)::int from public.job where tenant_id = ${tenant}::uuid) as j`;
    expect(counts[0].n).toBe(0);
    expect(counts[0].j).toBe(0);
  }, 120000);

  it('EZD-323 T4 the named test-only function is the one listed, closed to signed-in users @smoke', async () => {
    const rows = await sql<
      {
        fn: string;
        proname: string;
        anon: boolean;
        authenticated: boolean;
        service_role: boolean;
      }[]
    >`
      select format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) as fn,
        p.proname::text as proname,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
      order by 1`;
    const named = rows.filter((r) => isTestOnlyName(r.proname));
    expect(TEST_ONLY_FUNCTIONS.map((e) => e.fn)).toEqual([FN]);
    expect(named.map((r) => r.fn)).toEqual([FN]);
    expect(named[0].anon).toBe(false);
    expect(named[0].authenticated).toBe(false);
    expect(named[0].service_role).toBe(true);
    const problems = await auditRls(sql, { repoRoot });
    expect(problems.filter((p) => FOUR.includes(p.code))).toEqual([]);
  });

  it('EZD-323 T5 the name marker is a whole word test or dev', () => {
    for (const n of [
      'send_test_notification',
      'test',
      'test_reset',
      'dev_make_conflict',
      'make_conflict_dev',
      'Send_TEST_x',
      'send-test-x',
      'a dev b',
    ])
      expect(isTestOnlyName(n), n).toBe(true);
    for (const n of [
      'latest',
      'contest_x',
      'device_list',
      'list_notifications',
      'testing_run',
      'dev2_x',
      'attest',
    ])
      expect(isTestOnlyName(n), n).toBe(false);
  });

  it('EZD-323 T6 the audit flags open test-only functions', async () => {
    const make = (tx: Sql, name: string) =>
      tx.unsafe(`create function ${name}() returns integer language sql as 'select 1'`);
    const THREE = [
      'anon_executes_test_only_function',
      'authenticated_executes_test_only_function',
      'test_only_function_unlisted',
    ];
    await withRollback(sql, async (tx) => {
      await make(tx as unknown as Sql, 'public.ezd323_test_probe');
      expect(codes(await auditRls(tx, { repoRoot }), 'public.ezd323_test_probe()')).toEqual(THREE);
      await tx.unsafe(
        'revoke all on function public.ezd323_test_probe() from public, anon, authenticated',
      );
      expect(codes(await auditRls(tx, { repoRoot }), 'public.ezd323_test_probe()')).toEqual([
        'test_only_function_unlisted',
      ]);
    });
    await withRollback(sql, async (tx) => {
      await make(tx as unknown as Sql, 'private.ezd323_dev_probe');
      expect(codes(await auditRls(tx, { repoRoot }), 'private.ezd323_dev_probe()')).toEqual([
        'anon_executes_private_function',
        'anon_executes_test_only_function',
        'authenticated_executes_private_function',
        'authenticated_executes_test_only_function',
        'public_executes_private_function',
        'service_role_executes_private_function',
        'test_only_function_unlisted',
      ]);
    });
    await withRollback(sql, async (tx) => {
      await make(tx as unknown as Sql, 'public."EZD323_Test_Probe"');
      expect(codes(await auditRls(tx, { repoRoot }), 'public."EZD323_Test_Probe"()')).toEqual(
        THREE,
      );
    });
  });

  it('EZD-323 T7 the audit flags an opened or a stale entry', async () => {
    await withRollback(sql, async (tx) => {
      await tx.unsafe(`grant execute on function ${FN} to authenticated`);
      expect(codes(await auditRls(tx, { repoRoot }), FN)).toEqual([
        'authenticated_executes_test_only_function',
      ]);
    });
    await withRollback(sql, async (tx) => {
      await tx.unsafe(`drop function ${FN}`);
      expect(codes(await auditRls(tx, { repoRoot }), FN)).toEqual(['test_only_function_stale']);
    });
  });

  it('EZD-323 T8 only the job runner files and the dev route use the secret-key client', () => {
    const users = walk(appSrc)
      .filter((f) => /\.tsx?$/.test(f) && !isTestFile(f))
      .filter((f) => readFileSync(f, 'utf8').includes('createJobsDbClient'))
      .map(rel)
      .sort();
    expect(users).toEqual([
      'app/src/app/api/dev/notifications/route.ts',
      'app/src/server/jobs/db.ts',
      'app/src/server/jobs/default-hooks.ts',
      'app/src/server/jobs/handlers/notification-email.ts',
      'app/src/server/jobs/queue.ts',
      'app/src/server/jobs/runner.ts',
    ]);
  });
});
