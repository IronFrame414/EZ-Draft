// EZD-102 D1, D2, D3, D5 (vault/plans/EZD-102.md section 4; AC-EZD-102-4, AC-EZD-102-5). Local stack.
// Fresh tenants, projects and members from EZD-006's fixtures, removed in afterAll; switches set with
// setPermissions (section 3 harness); tokens from signIn (no email sent). Expected values: Decided
// "current_permissions SQL" (one row per active claim membership, keys and listed ids ordered, invoker,
// authenticated only), ARCH Row-level security (claims; 42501 on an ended session; two active memberships
// give no tenant claim), the primary keys of user_permission (EZD-101) and membership_project (EZD-005a),
// and Decided "broadcast SQL" (one user_permission.updated {} per member per statement, EZD-018 T23).
// D5 and D5c (EZD-291): each step runs through fencedStep (app/test-harness/realtime/stream.ts), which proves
// the Realtime broadcast stream live before the step and fences it with a probe after; no fixed waits.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withRollback } from '../../../test-harness/rls/db';
import {
  asClaims,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { explainLoad, loadPlanProblems } from '../../../test-harness/permissions/load-plan';
import { closeAllRealtime, connectRealtime } from '../../../test-harness/realtime/node-client';
import { fencedStep } from '../../../test-harness/realtime/stream';

const EVENT = 'user_permission.updated';

async function sqlStateOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

describe('EZD-102 current_permissions and the permission broadcast', () => {
  let tenant: string;
  let P: string;
  let Q: string;

  beforeAll(async () => {
    tenant = await createTenant();
    [P, Q] = await createProjects(tenant, 2);
  });

  afterAll(async () => {
    await closeAllRealtime();
    await cleanup();
    await closeHarness();
  }, 60000);

  it('D1 function: the claim membership, its granted keys and listed projects; 42501 after deactivation; no row with two active memberships', async () => {
    const m = await createMember({ tenantId: tenant, scope: 'listed', listed: [P] });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
    const s = await signIn(m.email);
    const rows = await asClaims(
      s.accessToken,
      (tx) => tx`select * from public.current_permissions()`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].membership_id).toBe(m.membershipId);
    expect(rows[0].project_scope).toBe('listed');
    expect(rows[0].permission_keys).toEqual(['edit_model', 'view_projects']);
    expect(rows[0].listed_project_ids).toEqual([P]);
    expect(rows[0].listed_project_ids).not.toContain(Q);

    const d = await createMember({ tenantId: tenant, scope: 'all' });
    const ds = await signIn(d.email);
    await harnessSql()`update public.membership set status = 'deactivated' where id = ${d.membershipId}::uuid`;
    const code = await sqlStateOf(() =>
      asClaims(ds.accessToken, (tx) => tx`select * from public.current_permissions()`),
    );
    expect(code).toBe('42501');

    const two = await createMember({ tenantId: tenant, scope: 'all' });
    const tenant2 = await createTenant();
    await harnessSql()`
      insert into public.membership (tenant_id, user_id, status, scope)
      values (${tenant2}::uuid, ${two.appUserId}::uuid, 'active', 'all')`;
    const ts = await signIn(two.email);
    const none = await asClaims(
      ts.accessToken,
      (tx) => tx`select * from public.current_permissions()`,
    );
    expect(none).toHaveLength(0);
  }, 45000);

  it('D2 grants: authenticated only, security invoker', async () => {
    const sql = harnessSql();
    const [g] = await sql`
      select
        has_function_privilege('authenticated', 'public.current_permissions()', 'execute') as authenticated,
        has_function_privilege('anon', 'public.current_permissions()', 'execute') as anon,
        has_function_privilege('service_role', 'public.current_permissions()', 'execute') as service_role`;
    expect(g.authenticated).toBe(true);
    expect(g.anon).toBe(false);
    expect(g.service_role).toBe(false);
    const procs = await sql`
      select p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'current_permissions'`;
    expect(procs).toHaveLength(1);
    expect(procs[0].prosecdef).toBe(false);
  });

  it('D3 indexed: every read in current_permissions() has an index condition, whatever the table statistics (EZD-285)', async () => {
    const load = await withRollback(harnessSql(), (tx) =>
      explainLoad(tx, 'public.current_permissions()'),
    );
    expect(load.language).toBe('sql');
    expect(load.statements).toBe(1);
    expect(load.tables).toEqual(['membership', 'membership_project', 'user_permission']);
    expect(loadPlanProblems(load), JSON.stringify(load.plan)).toEqual([]);
  });

  it('D5 broadcast: one user_permission.updated {} per statement on the member channel', async () => {
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const s = await signIn(m.email);
    const rt = await connectRealtime(s.accessToken);
    const own = rt.join(`user:${m.appUserId}`);
    expect(await own.joined).toBe('SUBSCRIBED');
    const sql = harnessSql();

    const deleteRow = () => sql`
      delete from public.user_permission
      where membership_id = ${m.membershipId}::uuid and permission_key = 'edit_model'`;
    const insertRow = () => sql`
      insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
      values (${tenant}::uuid, ${m.membershipId}::uuid, 'edit_model', true)`;
    const insertRowIfMissing = () => sql`
      insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
      values (${tenant}::uuid, ${m.membershipId}::uuid, 'edit_model', true)
      on conflict (membership_id, permission_key) do nothing`;

    const steps: Array<{
      name: string;
      restore?: () => Promise<unknown>;
      run: () => Promise<unknown>;
    }> = [
      {
        name: '(a) update one switch',
        run: () => sql`
          update public.user_permission set granted = true
          where membership_id = ${m.membershipId}::uuid and permission_key = 'edit_model'`,
      },
      {
        name: '(b) one statement updating all 37',
        run: async () => {
          const r = await sql`
            update public.user_permission set granted = not granted
            where membership_id = ${m.membershipId}::uuid`;
          expect(r.count).toBe(37);
        },
      },
      { name: '(c) delete one row', restore: insertRowIfMissing, run: deleteRow },
      { name: '(d) insert it back', restore: deleteRow, run: insertRow },
    ];

    for (const { name, restore, run } of steps) {
      const { arrived } = await fencedStep({
        sql,
        channel: own,
        accessToken: s.accessToken,
        event: EVENT,
        restore,
        run,
      });
      expect(arrived, name).toHaveLength(1);
      expect(arrived[0].payload, name).toEqual({});
    }
  }, 90000);

  it('D5c control: a delete whose event is never sent fails the D5 check (EZD-291)', async () => {
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const s = await signIn(m.email);
    const rt = await connectRealtime(s.accessToken);
    const own = rt.join(`user:${m.appUserId}`);
    expect(await own.joined).toBe('SUBSCRIBED');
    const sql = harnessSql();

    const { arrived } = await fencedStep({
      sql,
      channel: own,
      accessToken: s.accessToken,
      event: EVENT,
      restore: () => sql`
        insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
        values (${tenant}::uuid, ${m.membershipId}::uuid, 'edit_model', true)
        on conflict (membership_id, permission_key) do nothing`,
      run: () =>
        sql.begin(async (tx) => {
          await tx`set local session_replication_role = replica`;
          await tx`
            delete from public.user_permission
            where membership_id = ${m.membershipId}::uuid and permission_key = 'edit_model'`;
        }),
    });
    expect(arrived).toEqual([]);
    expect(() => expect(arrived, '(c) delete one row').toHaveLength(1)).toThrow();
  }, 60000);
});
