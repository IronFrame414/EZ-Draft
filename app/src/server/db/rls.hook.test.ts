// EZD-006 T7-T10 (vault/plans/EZD-006.md Tests): the custom access token hook's claims (Step 2), the
// no-tenant cases (Step 2; ticket Scope; Q-0043 (a): one active company per person), and the execute
// privileges of every function in schema private (Steps 1-4, 1b; Q-0087).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  createUnlinkedAuthUser,
  claimsOf,
  harnessSql,
  signIn,
  sortedIds,
} from '../../../test-harness/rls/fixtures';

const APP_CLAIMS = ['app_user_id', 'tenant_id', 'membership_id', 'project_scope'];

describe('EZD-006 token hook claims', () => {
  let tenantA: string;
  let p1: string;

  beforeAll(async () => {
    tenantA = await createTenant();
    [p1] = await createProjects(tenantA, 1);
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T7 an active member’s token carries the four app claims', async () => {
    const m = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1] });
    const s = await signIn(m.email);
    const claims = claimsOf(s.accessToken);
    expect(claims.tenant_id).toBe(tenantA);
    expect(claims.app_user_id).toBe(m.appUserId);
    expect(claims.membership_id).toBe(m.membershipId);
    expect(claims.project_scope).toBe('listed');
    expect(claims.sub).toBe(m.authUserId);
    expect(claims.role).toBe('authenticated');
    expect(typeof claims.session_id).toBe('string');
    expect((claims.session_id as string).length).toBeGreaterThan(0);
  });

  it('T8 (a) an auth user with no app_user row gets no app claims and reads nothing', async () => {
    const u = await createUnlinkedAuthUser();
    const s = await signIn(u.email);
    const claims = claimsOf(s.accessToken);
    for (const name of APP_CLAIMS) expect(claims).not.toHaveProperty(name);
    for (const table of ['project', 'tenant']) {
      const r = await s.serverDb.from(table).select('id');
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
  });

  for (const status of ['invited', 'deactivated'] as const) {
    it(`T8 (${status === 'invited' ? 'b' : 'c'}) a ${status} member gets app_user_id only and reads no tenant rows`, async () => {
      const m = await createMember({ tenantId: tenantA, scope: 'all', status });
      const s = await signIn(m.email);
      const claims = claimsOf(s.accessToken);
      expect(claims.app_user_id).toBe(m.appUserId);
      for (const name of ['tenant_id', 'membership_id', 'project_scope']) {
        expect(claims).not.toHaveProperty(name);
      }
      const projects = await s.serverDb.from('project').select('id');
      expect(projects.error).toBeNull();
      expect(projects.data).toEqual([]);
      const users = await s.serverDb.from('app_user').select('id');
      expect(users.error).toBeNull();
      expect(sortedIds(users.data)).toEqual([m.appUserId]);
    });
  }

  it('T9 two active memberships: app_user_id only, no tenant rows (Q-0043 (a))', async () => {
    const tenantB = await createTenant();
    const m = await createMember({ tenantId: tenantA, scope: 'all' });
    const second = await adminDb()
      .from('membership')
      .insert({ tenant_id: tenantB, user_id: m.appUserId, status: 'active', scope: 'all' });
    expect(second.error).toBeNull();
    const s = await signIn(m.email);
    const claims = claimsOf(s.accessToken);
    expect(claims.app_user_id).toBe(m.appUserId);
    for (const name of ['tenant_id', 'membership_id', 'project_scope']) {
      expect(claims).not.toHaveProperty(name);
    }
    for (const table of ['project', 'tenant', 'membership']) {
      const r = await s.serverDb.from(table).select('id');
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
  });

  it('T10 hook and helper execute privileges', async () => {
    const sql = harnessSql();
    const can = async (role: string, fn: string): Promise<boolean> => {
      const rows = await sql<{ ok: boolean }[]>`
        select has_function_privilege(${role}, ${fn}, 'execute') as ok`;
      return rows[0].ok;
    };

    const hook = 'private.custom_access_token_hook(jsonb)';
    expect(await can('supabase_auth_admin', hook)).toBe(true);
    expect(await can('anon', hook)).toBe(false);
    expect(await can('authenticated', hook)).toBe(false);

    const helpers = [
      'private.tenant_id()',
      'private.app_user_id()',
      'private.all_projects()',
      'private.listed_project_ids()',
      'private.tenant_user_ids()',
      'private.can_see_project(uuid)',
      'private.session_is_live()',
    ];
    for (const fn of helpers) {
      expect(await can('authenticated', fn), fn).toBe(true);
      expect(await can('anon', fn), fn).toBe(false);
    }

    const internal = [
      'private.end_user_sessions(uuid)',
      'private.membership_end_sessions()',
      'private.membership_project_end_sessions()',
      'private.set_api_gate_hash(text)',
    ];
    for (const fn of internal) {
      expect(await can('anon', fn), fn).toBe(false);
      expect(await can('authenticated', fn), fn).toBe(false);
    }
    expect(await can('service_role', 'private.set_api_gate_hash(text)')).toBe(false);

    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect(await can(role, 'private.api_request_gate()'), role).toBe(true);
    }

    const usage = await sql<{ ok: boolean }[]>`
      select has_schema_privilege('anon', 'private', 'usage') as ok`;
    expect(usage[0].ok).toBe(true);

    const anonCallable = await sql<{ proname: string }[]>`
      select p.proname::text as proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')
      order by 1`;
    expect(anonCallable.map((r) => r.proname)).toEqual(['api_request_gate']);
  });
});
