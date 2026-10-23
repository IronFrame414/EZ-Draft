// EZD-006 T15-T18, T23 (vault/plans/EZD-006.md Tests): the CI audit on the real schema (@smoke, ticket
// Scope; 11 Operations), each audit code on throwaway tables inside rolled-back transactions (Step 6
// table), the exemption and grant lists (EZD-005 Step 1.3; 03 intro; Step 5), the explicit-grant reader
// and the privilege catalog (Step 5 grants; orchestrator's brief 2026-10-12: no dependence on
// "Automatically expose new tables"). Probe names are literal text in this file only inside SQL, never as
// a describeTenantIsolation call, so the audit's no_isolation_test code applies to them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminSql,
  withRollback,
  type Sql,
  type TransactionSql,
} from '../../../test-harness/rls/db';
import { auditRls } from '../../../test-harness/rls/audit';
import {
  ALL_TABLE_PRIVILEGES,
  explicitGrantRoles,
  TABLE_GRANTS,
} from '../../../test-harness/rls/table-grants';
import { TENANTLESS_TABLES } from '../../../test-harness/rls/tenancy-exemptions';
import {
  asClaims,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  signIn,
} from '../../../test-harness/rls/fixtures';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GRANT_CODES = [
  'grants_not_explicit',
  'authenticated_grants_mismatch',
  'service_role_grants_missing',
];
const TENANCY_TABLES = ['tenant', 'app_user', 'membership', 'membership_project', 'project'];
const DATA_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

const TEMPLATE_USING =
  'tenant_id = (select private.tenant_id()) and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))';

describe('EZD-006 RLS audit', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = adminSql();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
    await sql.end({ timeout: 5 });
  });

  const codesFor = (
    problems: { table: string; code: string }[],
    table: string,
    drop: string[] = [],
  ) =>
    problems
      .filter((p) => p.table === table && !drop.includes(p.code))
      .map((p) => p.code)
      .sort();

  const auditIn = (tx: TransactionSql) => auditRls(tx, { repoRoot });

  it('EZD-006 every table has a tenant policy and tenant/project indexes @smoke', async () => {
    expect(await auditRls(sql, { repoRoot })).toEqual([]);
  });

  it('T16 the audit catches each problem', async () => {
    await withRollback(sql, async (tx) => {
      const probe = async (step: number, expected: string[]) => {
        const problems = await auditIn(tx);
        expect(codesFor(problems, 'ezd006_probe', GRANT_CODES), `step ${step}`).toEqual(
          [...expected].sort(),
        );
        return problems;
      };

      await tx.unsafe(
        'create table public.ezd006_probe (id uuid primary key, tenant_id uuid, project_id uuid)',
      );
      await probe(1, [
        'rls_disabled',
        'no_policy',
        'no_tenant_index',
        'no_project_index',
        'no_isolation_test',
      ]);

      await tx.unsafe('alter table public.ezd006_probe enable row level security');
      await tx.unsafe(
        'create policy ezd006_probe_select on public.ezd006_probe for select to authenticated using (true)',
      );
      await probe(2, [
        'policy_missing_tenant_helper',
        'policy_missing_scope_helper',
        'no_tenant_index',
        'no_project_index',
        'no_isolation_test',
      ]);

      await tx.unsafe('drop policy ezd006_probe_select on public.ezd006_probe');
      await tx.unsafe(
        'create policy ezd006_probe_select on public.ezd006_probe for select to authenticated using (tenant_id = private.tenant_id() and project_id = any (private.listed_project_ids()))',
      );
      await probe(3, [
        'helper_not_wrapped',
        'no_tenant_index',
        'no_project_index',
        'no_isolation_test',
      ]);

      await tx.unsafe('drop policy ezd006_probe_select on public.ezd006_probe');
      await tx.unsafe(
        `create policy ezd006_probe_select on public.ezd006_probe for select to authenticated using (${TEMPLATE_USING})`,
      );
      await tx.unsafe('create index on public.ezd006_probe (tenant_id)');
      await tx.unsafe('create index on public.ezd006_probe (project_id)');
      await probe(4, ['no_isolation_test']);

      await tx.unsafe('grant select on public.ezd006_probe to anon');
      await probe(5, ['anon_has_privileges', 'no_isolation_test']);

      await tx.unsafe('revoke select on public.ezd006_probe from anon');
      await tx.unsafe('create view public.ezd006_probe_v as select * from public.ezd006_probe');
      const withView = await auditIn(tx);
      expect(codesFor(withView, 'ezd006_probe_v')).toContain('view_not_security_invoker');

      await tx.unsafe('drop view public.ezd006_probe_v');
      await tx.unsafe('create table public.ezd006_nt (id uuid primary key)');
      await tx.unsafe('alter table public.ezd006_nt enable row level security');
      await tx.unsafe(
        'create policy ezd006_nt_select on public.ezd006_nt for select to authenticated using (true)',
      );
      const withTenantless = await auditIn(tx);
      expect(codesFor(withTenantless, 'ezd006_nt')).toContain('no_tenant_id');

      await tx.unsafe('drop policy ezd006_probe_select on public.ezd006_probe');
      await tx.unsafe(
        'create policy ezd006_probe_select on public.ezd006_probe for select to authenticated using (exists (select 1 from public.membership m where m.tenant_id = ezd006_probe.tenant_id))',
      );
      await probe(8, [
        'policy_joins_membership',
        'policy_missing_tenant_helper',
        'policy_missing_scope_helper',
        'no_isolation_test',
      ]);
    });
  });

  it('T17 the tenant is read once per query: InitPlan, no membership scan', async () => {
    const tenantA = await createTenant();
    const [p1] = await createProjects(tenantA, 1);
    const o = await createMember({ tenantId: tenantA, scope: 'all' });
    const l = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1] });
    for (const m of [o, l]) {
      const s = await signIn(m.email);
      const plan = await asClaims(s.accessToken, async (tx) => {
        const rows = await tx<
          { 'QUERY PLAN': unknown }[]
        >`explain (format json) select * from public.project`;
        return rows[0]['QUERY PLAN'];
      });
      const nodes = flattenPlan(plan);
      expect(nodes.some((n) => String(n['Subplan Name'] ?? '').startsWith('InitPlan'))).toBe(true);
      for (const n of nodes) {
        expect(['membership', 'membership_project']).not.toContain(n['Relation Name']);
      }
    }
  });

  it('T18 exemption and grant lists match the catalog', async () => {
    const tables = await sql<{ table: string; columns: string[] }[]>`
      select c.relname::text as table,
        coalesce((select array_agg(a.attname::text) from pg_attribute a
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '{}') as columns
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')`;
    const byName = new Map(tables.map((t) => [t.table, t.columns]));

    const exemptNames = TENANTLESS_TABLES.map((t) => t.table).sort();
    expect(exemptNames).toEqual(['app_user', 'tenant']);
    for (const t of TENANTLESS_TABLES) {
      expect(t.reason.length, t.table).toBeGreaterThan(0);
      expect(byName.get(t.table), t.table).toBeDefined();
      expect(byName.get(t.table)).not.toContain('tenant_id');
    }
    for (const t of tables) {
      if (exemptNames.includes(t.table)) continue;
      expect(t.columns, t.table).toContain('tenant_id');
    }

    expect(Object.keys(TABLE_GRANTS).sort()).toEqual([
      'app_user',
      'error_alert',
      'job',
      'membership',
      'membership_project',
      'tenant',
    ]);
    for (const [table, grant] of Object.entries(TABLE_GRANTS)) {
      expect(grant.privileges, table).toEqual(['SELECT']);
      expect(grant.reason.length, table).toBeGreaterThan(0);
      expect(byName.has(table), table).toBe(true);
      for (const p of grant.privileges) expect(ALL_TABLE_PRIVILEGES).toContain(p);
    }
  });

  it('T23 (a) explicitGrantRoles reads only grant statements that name the table', () => {
    const roles = (text: string) => [...explicitGrantRoles([text], 'x')].sort();
    expect(
      roles('grant select, insert, update, delete on public.x to authenticated, service_role;'),
    ).toEqual(['authenticated', 'service_role']);
    expect(roles('GRANT SELECT ON TABLE "public"."x" TO authenticated;')).toEqual([
      'authenticated',
    ]);
    expect(roles('grant select on public.x, public.y to service_role;')).toEqual(['service_role']);
    expect(roles('grant all on all tables in schema public to authenticated;')).toEqual([]);
    expect(roles('-- grant select on public.x to authenticated')).toEqual([]);
    expect(roles('grant select on public.xy to authenticated;')).toEqual([]);
    expect(roles('grant usage on schema public to authenticated;')).toEqual([]);
    expect(roles('revoke select on public.x from authenticated;')).toEqual([]);
  });

  it('T23 (b)-(d) default privileges grant nothing; schema usage; explicit table privileges', async () => {
    const defaults = await sql<{ grantee: string; privilege_type: string }[]>`
      select r.rolname::text as grantee, x.privilege_type
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
      join pg_roles o on o.oid = d.defaclrole
      cross join lateral aclexplode(d.defaclacl) x
      left join pg_roles r on r.oid = x.grantee
      where o.rolname = 'postgres' and n.nspname = 'public' and d.defaclobjtype = 'r'`;
    for (const row of defaults) {
      expect(['anon', 'authenticated', 'service_role'], JSON.stringify(row)).not.toContain(
        row.grantee,
      );
    }

    for (const role of ['anon', 'authenticated', 'service_role']) {
      const rows = await sql<{ ok: boolean }[]>`
        select has_schema_privilege(${role}, 'public', 'usage') as ok`;
      expect(rows[0].ok, role).toBe(true);
    }

    const priv = async (role: string, table: string, p: string) => {
      const rows = await sql<{ ok: boolean }[]>`
        select has_table_privilege(${role}, ${'public.' + table}, ${p}) as ok`;
      return rows[0].ok;
    };
    for (const table of TENANCY_TABLES) {
      for (const p of DATA_PRIVS) {
        expect(await priv('service_role', table, p), `service_role ${table} ${p}`).toBe(true);
        const expected = table === 'project' ? true : p === 'SELECT';
        expect(await priv('authenticated', table, p), `authenticated ${table} ${p}`).toBe(expected);
      }
    }
  });

  it('T23 (e) the audit’s grant codes on a probe table', async () => {
    await withRollback(sql, async (tx) => {
      const grantCodes = async () =>
        codesFor(await auditIn(tx), 'ezd006_grant_probe').filter((c) => GRANT_CODES.includes(c));

      await tx.unsafe(
        'create table public.ezd006_grant_probe (id uuid primary key, tenant_id uuid)',
      );
      await tx.unsafe('alter table public.ezd006_grant_probe enable row level security');
      await tx.unsafe(
        'create policy ezd006_grant_probe_select on public.ezd006_grant_probe for select to authenticated using (tenant_id = (select private.tenant_id()))',
      );
      await tx.unsafe('create index on public.ezd006_grant_probe (tenant_id)');
      expect(await grantCodes()).toEqual(
        [
          'grants_not_explicit',
          'authenticated_grants_mismatch',
          'service_role_grants_missing',
        ].sort(),
      );

      await tx.unsafe(
        'grant select, insert, update, delete on public.ezd006_grant_probe to authenticated, service_role',
      );
      expect(await grantCodes()).toEqual(['grants_not_explicit']);

      await tx.unsafe('revoke delete on public.ezd006_grant_probe from authenticated');
      expect(await grantCodes()).toEqual(['authenticated_grants_mismatch', 'grants_not_explicit']);
    });
  });
});

type PlanNode = Record<string, unknown>;

function flattenPlan(plan: unknown): PlanNode[] {
  const out: PlanNode[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const n = node as PlanNode;
    if ('Node Type' in n) out.push(n);
    for (const value of Object.values(n)) {
      if (value && typeof value === 'object') walk(value);
    }
  };
  walk(plan);
  return out;
}
