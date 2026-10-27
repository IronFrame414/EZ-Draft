// EZD-190 B1-B11 (vault/plans/EZD-190.md section 4): the database refuses a signed-in request that came
// through PostgREST without the server gate header, whether or not PostgREST's pre-request hook is loaded.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminSql,
  withRollback,
  type Sql,
  type TransactionSql,
} from '../../../test-harness/rls/db';
import { API_GATE_POLICY_EXPR } from '../../../test-harness/rls/audit';
import {
  asClaims,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  gateSecret,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { setPermissions } from '../../../test-harness/permissions/grant';

const GATE_ERROR = { code: '42501', message: 'api_gate' };
const ZERO = '00000000-0000-4000-8000-000000000000';
const EXPECTED_TABLES = [
  'app_user',
  'customer',
  'error_alert',
  'job',
  'membership',
  'membership_project',
  'project',
  'role',
  'source_file',
  'tenant',
  'user_permission',
];
const GUARDED_FUNCTIONS = [
  'current_app_user_id',
  'enqueue_job',
  'error_tunnel_take',
  'link_app_user',
  'record_error_alert',
  'release_error_alert_email',
  'sign_in_throttle_settle',
  'sign_in_throttle_take',
  'update_tenant_identity',
];

async function simulate(
  tx: TransactionSql,
  headers: Record<string, string>,
  extra: { storageOperation?: string } = {},
): Promise<void> {
  await tx`select set_config('request.path', '/project', true)`;
  await tx`select set_config('request.headers', ${JSON.stringify(headers)}, true)`;
  if (extra.storageOperation) {
    await tx`select set_config('storage.operation', ${extra.storageOperation}, true)`;
  }
}

async function expectGateRefusal(tx: TransactionSql, text: string): Promise<void> {
  await expect(tx.savepoint(async (sp) => sp.unsafe(text))).rejects.toMatchObject(GATE_ERROR);
}

describe('EZD-190 API gate backstop in the database', () => {
  let sql: Sql;
  let tenantId: string;
  let p1: string;
  let o: Member;
  let l: Member;
  let so: Session;
  let sl: Session;

  beforeAll(async () => {
    sql = adminSql();
    tenantId = await createTenant();
    [p1] = await createProjects(tenantId, 1);
    o = await createMember({ tenantId, scope: 'all' });
    l = await createMember({ tenantId, scope: 'listed', listed: [p1] });
    // A restrictive policy runs per row: give o permission rows so the user_permission read has one to refuse.
    await setPermissions(tenantId, o.membershipId, []);
    so = await signIn(o.email);
    sl = await signIn(l.email);
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
    await sql.end({ timeout: 5 });
  });

  const countOf = async (tx: TransactionSql, table: string): Promise<number> => {
    const rows = await tx.unsafe(`select count(*)::int as n from public.${table}`);
    return rows[0].n as number;
  };

  it('B1 every table the signed-in role can touch has the gate policy', async () => {
    const policies = await sql<
      {
        tablename: string;
        permissive: string;
        cmd: string;
        roles: string[];
        qual: string;
        with_check: string;
      }[]
    >`select tablename::text, permissive::text, cmd::text, roles::text[] as roles, qual, with_check
      from pg_policies where schemaname = 'public' and policyname like '%\_api\_gate' order by tablename`;
    const privileged = await sql<{ table: string }[]>`
      select c.relname::text as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and (has_table_privilege('authenticated', c.oid, 'select')
          or has_table_privilege('authenticated', c.oid, 'insert')
          or has_table_privilege('authenticated', c.oid, 'update')
          or has_table_privilege('authenticated', c.oid, 'delete'))
      order by 1`;
    const policyTables = policies.map((p) => p.tablename).sort();
    const privilegedTables = privileged.map((r) => r.table).sort();
    expect(policyTables).toEqual(privilegedTables);
    for (const t of EXPECTED_TABLES) {
      expect(policyTables).toContain(t);
      expect(privilegedTables).toContain(t);
    }
    for (const p of policies) {
      expect(p.permissive).toBe('RESTRICTIVE');
      expect(p.cmd).toBe('ALL');
      expect(p.roles).toEqual(['authenticated']);
      expect(p.qual).toBe(API_GATE_POLICY_EXPR);
      expect(p.with_check).toBe(API_GATE_POLICY_EXPR);
    }
  });

  it('B2 no header: every table read is refused', async () => {
    await asClaims(so.accessToken, async (tx) => {
      await simulate(tx, {});
      for (const t of ['tenant', 'app_user', 'membership', 'project', 'role', 'user_permission']) {
        await expectGateRefusal(tx, `select count(*) from public.${t}`);
      }
    });
    await asClaims(sl.accessToken, async (tx) => {
      await simulate(tx, {});
      await expectGateRefusal(tx, 'select count(*) from public.membership_project');
    });
  });

  it('B3 a wrong header is refused', async () => {
    await asClaims(so.accessToken, async (tx) => {
      await simulate(tx, { 'x-ezd-api-gate': 'wrong' });
      await expectGateRefusal(tx, 'select count(*) from public.project');
    });
  });

  it('B4 the right header reads', async () => {
    await asClaims(so.accessToken, async (tx) => {
      await simulate(tx, { 'x-ezd-api-gate': gateSecret() });
      expect(await countOf(tx, 'project')).toBe(1);
      expect(await countOf(tx, 'tenant')).toBe(1);
    });
  });

  it('B5 a Storage operation passes without the header', async () => {
    await asClaims(so.accessToken, async (tx) => {
      await simulate(tx, {}, { storageOperation: 'object.get' });
      expect(await countOf(tx, 'project')).toBe(1);
    });
  });

  it('B6 a direct database session with no request path passes', async () => {
    await asClaims(so.accessToken, async (tx) => {
      expect(await countOf(tx, 'project')).toBe(1);
    });
  });

  it('B7 no header: a write is refused', async () => {
    await asClaims(so.accessToken, async (tx) => {
      await simulate(tx, {});
      await expectGateRefusal(tx, `update public.project set name = name where id = '${p1}'`);
    });
  });

  it('B8 service_role and anon rpc/health pass through a guarded RPC', async () => {
    await withRollback(sql, async (tx) => {
      await tx.unsafe('set local role service_role');
      await simulate(tx, {});
      const rows = await tx.unsafe(
        "select * from public.record_error_alert('error', 'browser', repeat('0', 64), 'Error: gate', null, null, null)",
      );
      expect(rows.length).toBe(1);
      expect(rows[0].alert_id).not.toBeNull();
    });
    await withRollback(sql, async (tx) => {
      await tx.unsafe('set local role anon');
      await tx`select set_config('request.path', '/rpc/health', true)`;
      await tx`select set_config('request.headers', '{}', true)`;
      const rows = await tx.unsafe(`select public.sign_in_throttle_settle('${ZERO}', null)`);
      expect(rows.length).toBe(1);
    });
  });

  it('B9 every callable security definer function guards itself @smoke', async () => {
    const rows = await sql<{ proname: string; prosrc: string }[]>`
      select p.proname::text, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.proname <> 'health'
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))
      order by 1`;
    const names = rows.map((r) => r.proname);
    for (const fn of GUARDED_FUNCTIONS) expect(names).toContain(fn);
    for (const r of rows) {
      expect(r.prosrc, r.proname).toContain('private.require_api_gate()');
    }
  });

  it('B10 no header: each guarded function is refused', async () => {
    await asClaims(so.accessToken, async (tx) => {
      await simulate(tx, {});
      for (const text of [
        'select public.current_app_user_id()',
        'select * from public.link_app_user()',
        "select public.enqueue_job('test', null, '{}'::jsonb, 5, null)",
        "select * from public.update_tenant_identity('x', null, '{}'::jsonb, false, null)",
      ]) {
        await expectGateRefusal(tx, text);
      }
    });
    await withRollback(sql, async (tx) => {
      await tx.unsafe('set local role anon');
      await simulate(tx, {});
      for (const text of [
        "select public.record_error_alert('error', 'browser', repeat('0', 64), 'Error: gate', null, null, null)",
        `select public.release_error_alert_email('${ZERO}', '${ZERO}')`,
        "select public.sign_in_throttle_take('link', null, repeat('0', 64))",
        `select public.sign_in_throttle_settle('${ZERO}', null)`,
        "select public.error_tunnel_take(repeat('0', 64), 1)",
      ]) {
        await expectGateRefusal(tx, text);
      }
    });
  });

  it('B11 current_app_user_id answers the user with the header and with no request path', async () => {
    await asClaims(so.accessToken, async (tx) => {
      await simulate(tx, { 'x-ezd-api-gate': gateSecret() });
      const rows = await tx`select public.current_app_user_id() as id`;
      expect(rows[0].id).toBe(o.appUserId);
    });
    await asClaims(so.accessToken, async (tx) => {
      const rows = await tx`select public.current_app_user_id() as id`;
      expect(rows[0].id).toBe(o.appUserId);
    });
  });
});
