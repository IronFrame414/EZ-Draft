// EZD-006 T22 (vault/plans/EZD-006.md Tests; Q-0087 (ii), security-reviewer Stage 2): PostgREST refuses
// every anon or authenticated request without the server-only gate header (tables, RPC, GraphQL),
// allow-lists anon rpc/health, lets service_role pass, and fails closed with no stored hash (Step 1b;
// EZD-004 Step 2). Only this file uses browserDb and header-less clients.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSql, withRollback, type Sql } from '../../../test-harness/rls/db';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  gateSecret,
  sessionClient,
  signIn,
  sortedIds,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { GATED_RPC_CALLS } from '../../../test-harness/rls/gate';

const PRIVILEGE = '42501';
const CREATED_BY_TEST = ['project', 'membership', 'membership_project'];

describe('EZD-006 API request gate', () => {
  let sql: Sql;
  let tenantA: string;
  let p1: string;
  let p1Name: string;
  let g: Member;
  let s: Session;
  let tables: string[] = [];
  let tenantTables: string[] = [];

  beforeAll(async () => {
    sql = adminSql();
    tenantA = await createTenant();
    [p1] = await createProjects(tenantA, 1);
    g = await createMember({ tenantId: tenantA, scope: 'all' });
    s = await signIn(g.email);
    const { data } = await adminDb().from('project').select('name').eq('id', p1).single();
    p1Name = (data as { name: string }).name;
    const rows = await sql<{ table: string; has_tenant: boolean }[]>`
      select c.relname::text as table,
        exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id'
          and not a.attisdropped) as has_tenant
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`;
    tables = rows.map((r) => r.table);
    tenantTables = rows.filter((r) => r.has_tenant).map((r) => r.table);
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
    await sql.end({ timeout: 5 });
  });

  async function expectTenantAUntouched(): Promise<void> {
    const projects = await adminDb().from('project').select('id, name').eq('tenant_id', tenantA);
    expect(sortedIds(projects.data)).toEqual([p1]);
    expect((projects.data ?? [])[0]?.name).toBe(p1Name);
    const memberships = await adminDb().from('membership').select('id').eq('tenant_id', tenantA);
    expect(sortedIds(memberships.data)).toEqual([g.membershipId]);
    const listed = await adminDb().from('membership_project').select('*').eq('tenant_id', tenantA);
    expect(listed.data).toEqual([]);
    for (const table of tenantTables) {
      if (CREATED_BY_TEST.includes(table)) continue;
      const { data, error } = await adminDb()
        .from(table)
        .select('tenant_id')
        .eq('tenant_id', tenantA);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  }

  it('EZD-006 PostgREST refuses requests without the server gate header @smoke', async () => {
    // (a) reads with a user's token and no header
    for (const table of tables) {
      const r = await s.browserDb.from(table).select('*');
      expect(r.error?.code, `select ${table}`).toBe(PRIVILEGE);
    }
    // (b) writes with a user's token and no header
    for (const table of tables) {
      const r = await s.browserDb.from(table).insert({});
      expect(r.error?.code, `insert ${table}`).toBe(PRIVILEGE);
    }
    const insert = await s.browserDb
      .from('project')
      .insert({ tenant_id: tenantA, name: 'no header', address: '1 Test St', type: 'kitchen' });
    expect(insert.error?.code).toBe(PRIVILEGE);
    const update = await s.browserDb.from('project').update({ name: 'no header' }).eq('id', p1);
    expect(update.error?.code).toBe(PRIVILEGE);
    const del = await s.browserDb.from('project').delete().eq('id', p1);
    expect(del.error?.code).toBe(PRIVILEGE);
    // (c) every listed RPC without the header
    for (const call of GATED_RPC_CALLS) {
      const r = await s.browserDb.rpc(call.fn, call.args);
      expect(r.error?.code, `rpc ${call.fn}`).toBe(PRIVILEGE);
    }
    // (e) a wrong secret
    const wrong = sessionClient(s.accessToken, randomBytes(32).toString('base64url'));
    const wrongRead = await wrong.from('project').select('id');
    expect(wrongRead.error?.code).toBe(PRIVILEGE);
    await expectTenantAUntouched();
  });

  it('T22 (d) GraphQL without the header is refused', async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/graphql/v1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
        Authorization: `Bearer ${s.accessToken}`,
      },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe(PRIVILEGE);
  });

  it('T22 (f) anon without the header: health answers, tables refuse', async () => {
    const anon = anonDb({ gate: false });
    const health = await anon.rpc('health');
    expect(health.error).toBeNull();
    expect((health.data as { status: string }[])[0].status).toBe('ok');
    const read = await anon.from('project').select('id');
    expect(read.error?.code).toBe(PRIVILEGE);
  });

  it('T22 (g) a server client with the header reads its rows (control)', async () => {
    const r = await s.serverDb.from('project').select('id');
    expect(r.error).toBeNull();
    expect(sortedIds(r.data)).toEqual([p1]);
  });

  it('T22 (h) the gate is registered as pgrst.db_pre_request on authenticator', async () => {
    const rows = await sql<{ setconfig: string[] | null }[]>`
      select s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
      where r.rolname = 'authenticator'`;
    const settings = rows.flatMap((r) => r.setconfig ?? []);
    expect(settings).toContain('pgrst.db_pre_request=private.api_request_gate');
  });

  it('T22 (i) the gate fails closed without a stored hash and lets service_role pass', async () => {
    const headers = JSON.stringify({ 'x-ezd-api-gate': gateSecret() });
    const closed = await withRollback(sql, async (tx) => {
      await tx`delete from vault.secrets where name = 'ezd_api_gate_sha256'`;
      await tx.unsafe('set local role authenticated');
      await tx`select set_config('request.headers', ${headers}, true)`;
      await tx`select set_config('request.path', '/project', true)`;
      try {
        await tx`select private.api_request_gate()`;
        return null;
      } catch (e) {
        return (e as { code?: string }).code ?? 'no code';
      }
    });
    expect(closed).toBe(PRIVILEGE);

    const passed = await withRollback(sql, async (tx) => {
      await tx.unsafe('set local role service_role');
      await tx`select set_config('request.path', '/project', true)`;
      await tx`select private.api_request_gate()`;
      return 'ok';
    });
    expect(passed).toBe('ok');
  });

  it('T22 (j) every public function anon or authenticated can execute is in GATED_RPC_CALLS', async () => {
    const rows = await sql<{ proname: string }[]>`
      select distinct p.proname::text as proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))
      order by 1`;
    const listed = GATED_RPC_CALLS.map((c) => c.fn);
    for (const r of rows) expect(listed, r.proname).toContain(r.proname);
  });
});
