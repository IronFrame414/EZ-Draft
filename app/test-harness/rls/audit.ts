// EZD-006 Step 6 (vault/plans/EZD-006.md): auditRls(sql, { repoRoot }) reads the catalog for every table
// and view in schemas public and private, the app test files and the migration files, and returns one
// problem per failed rule. Codes and their sources are the plan's Step 6 table. The audit test (T15) is
// @smoke, so every later ticket's gate runs it. Sources: 03 intro, 03 membership, 11 rule 10,
// 11 Operations, 11 Security; Step 5 grants convention (orchestrator's brief 2026-10-12).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Sql, TransactionSql } from './db';
import { expectedAuthenticatedPrivileges, explicitGrantRoles } from './table-grants';
import { PROJECT_KEY, TENANTLESS_TABLES } from './tenancy-exemptions';

export type RlsProblem = { table: string; code: string };

type Relation = {
  schema: string;
  table: string;
  relkind: string;
  relrowsecurity: boolean;
  reloptions: string[] | null;
  columns: string[];
};
type Policy = {
  tablename: string;
  policyname: string;
  roles: string[];
  cmd: string;
  qual: string | null;
  with_check: string | null;
};
type Privilege = { schema: string; table: string; role: string; priv: string; ok: boolean };

const ROLES = ['anon', 'authenticated', 'service_role'];
const PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const DATA_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const SCOPE_HELPERS = [/private\.listed_project_ids\(\)/, /private\.can_see_project\(/];

export async function auditRls(
  sql: Sql | TransactionSql,
  options: { repoRoot: string },
): Promise<RlsProblem[]> {
  const problems: RlsProblem[] = [];
  const add = (table: string, code: string) => problems.push({ table, code });

  const relations = await sql<Relation[]>`
    select n.nspname as schema, c.relname as table, c.relkind::text as relkind, c.relrowsecurity,
      c.reloptions,
      coalesce((select array_agg(a.attname::text order by a.attnum) from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '{}') as columns
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v')
    order by n.nspname, c.relname`;

  const indexFirstColumns = await sql<{ schema: string; table: string; attname: string }[]>`
    select n.nspname as schema, c.relname as table, a.attname::text as attname
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where n.nspname in ('public', 'private')`;

  const policies = await sql<Policy[]>`
    select tablename::text as tablename, policyname::text as policyname, roles::text[] as roles,
      cmd::text as cmd, qual, with_check
    from pg_policies where schemaname in ('public', 'private')`;

  const privileges = await sql<Privilege[]>`
    select n.nspname as schema, c.relname as table, r.role, p.priv,
      has_table_privilege(r.role, c.oid, p.priv) as ok
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(${ROLES}::text[]) as r(role)
    cross join unnest(${PRIVS}::text[]) as p(priv)
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v')`;

  const testText = readAppTestText(options.repoRoot);
  const migrationTexts = readMigrationTexts(options.repoRoot);
  const exempt = new Set(TENANTLESS_TABLES.map((t) => t.table));

  const firstCols = (rel: Relation) =>
    indexFirstColumns
      .filter((i) => i.schema === rel.schema && i.table === rel.table)
      .map((i) => i.attname);
  const has = (rel: Relation, role: string, priv: string) =>
    privileges.some(
      (p) =>
        p.schema === rel.schema &&
        p.table === rel.table &&
        p.role === role &&
        p.priv === priv &&
        p.ok,
    );

  for (const rel of relations) {
    const name = rel.table;
    const isTable = rel.relkind === 'r' || rel.relkind === 'p';
    const isView = rel.relkind === 'v';

    if (rel.schema === 'private' && isTable) add(name, 'table_in_private_schema');

    if (isTable) {
      const tablePolicies = policies.filter((p) => p.tablename === name);
      if (!rel.relrowsecurity) add(name, 'rls_disabled');
      if (tablePolicies.length === 0) add(name, 'no_policy');

      const isExempt = exempt.has(name);
      const hasTenantId = rel.columns.includes('tenant_id');
      const scopeKey = PROJECT_KEY[name] ?? 'project_id';
      const hasScopeKey = rel.columns.includes(scopeKey);
      const scopeUsingOnly = name in PROJECT_KEY;

      if (!hasTenantId && !isExempt) add(name, 'no_tenant_id');
      if (!isExempt) {
        const first = firstCols(rel);
        if (hasTenantId && !first.includes('tenant_id')) add(name, 'no_tenant_index');
        if (rel.columns.includes('project_id') && !first.includes('project_id')) {
          add(name, 'no_project_index');
        }
        if (hasTenantId && !hasIsolationTest(testText, name)) add(name, 'no_isolation_test');
      }

      for (const p of tablePolicies) {
        const using = p.qual ?? '';
        const check = p.with_check ?? '';
        const both = `${using}\n${check}`;
        const cmd = p.cmd.toUpperCase();
        if (!isExempt && hasTenantId && !/private\.tenant_id\(\)/.test(both)) {
          add(name, 'policy_missing_tenant_helper');
        }
        if (!isExempt && hasScopeKey) {
          const usingApplies = ['SELECT', 'UPDATE', 'DELETE', 'ALL'].includes(cmd);
          const checkApplies = !scopeUsingOnly && ['INSERT', 'UPDATE', 'ALL'].includes(cmd);
          const missing =
            (usingApplies && !SCOPE_HELPERS.some((re) => re.test(using))) ||
            (checkApplies && !SCOPE_HELPERS.some((re) => re.test(check)));
          if (missing) add(name, 'policy_missing_scope_helper');
        }
        if (hasUnwrappedHelper(both)) add(name, 'helper_not_wrapped');
        if (/\b(from|join)\s+(public\.)?(membership|membership_project)\b/i.test(both)) {
          add(name, 'policy_joins_membership');
        }
        const roles = [...p.roles].sort();
        if (roles.length !== 1 || roles[0] !== 'authenticated') {
          add(name, 'policy_not_to_authenticated');
        }
      }
    }

    if (isView) {
      const opts = rel.reloptions ?? [];
      if (!opts.some((o) => /^security_invoker=(true|on)$/i.test(o))) {
        add(name, 'view_not_security_invoker');
      }
    }

    if (PRIVS.some((priv) => has(rel, 'anon', priv))) add(name, 'anon_has_privileges');
    if (['TRUNCATE', 'REFERENCES', 'TRIGGER'].some((priv) => has(rel, 'authenticated', priv))) {
      add(name, 'authenticated_extra_privileges');
    }

    if (rel.schema === 'public') {
      const expected = [...expectedAuthenticatedPrivileges(name)].sort().join(',');
      const roles = explicitGrantRoles(migrationTexts, name);
      if (!roles.has('service_role') || (expected.length > 0 && !roles.has('authenticated'))) {
        add(name, 'grants_not_explicit');
      }
      const actual = DATA_PRIVS.filter((priv) => has(rel, 'authenticated', priv))
        .sort()
        .join(',');
      if (actual !== expected) add(name, 'authenticated_grants_mismatch');
      if (DATA_PRIVS.some((priv) => !has(rel, 'service_role', priv))) {
        add(name, 'service_role_grants_missing');
      }
    }
  }
  return problems;
}

// pg_policies prints a wrapped helper as `( SELECT private.<fn>() AS <fn>)`; any other call site of a
// `private.` helper (other than can_see_project) runs per row (11 rule 10).
export function hasUnwrappedHelper(expression: string): boolean {
  const calls = expression.match(/private\.(\w+)\(/g) ?? [];
  for (const call of calls) {
    const fn = /private\.(\w+)\(/.exec(call)![1];
    if (fn === 'can_see_project') continue;
    const total = countMatches(expression, new RegExp(`private\\.${fn}\\(`, 'g'));
    const wrapped = countMatches(
      expression,
      new RegExp(`\\(\\s*SELECT\\s+private\\.${fn}\\(`, 'gi'),
    );
    if (total !== wrapped) return true;
  }
  return false;
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function hasIsolationTest(testText: string, table: string): boolean {
  return (
    testText.includes(`describeTenantIsolation('${table}'`) ||
    testText.includes(`describeTenantIsolation("${table}"`)
  );
}

function readAppTestText(repoRoot: string): string {
  const dir = path.join(repoRoot, 'app', 'src');
  let out = '';
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.test\.tsx?$/.test(entry.name)) continue;
    out += readFileSync(path.join(entry.parentPath, entry.name), 'utf8') + '\n';
  }
  return out;
}

function readMigrationTexts(repoRoot: string): string[] {
  const dir = path.join(repoRoot, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8'));
}
