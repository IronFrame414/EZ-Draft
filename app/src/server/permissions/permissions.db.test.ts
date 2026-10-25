// EZD-102 D1, D2, D3, D5 (vault/plans/EZD-102.md section 4; AC-EZD-102-4, AC-EZD-102-5). Local stack.
// Fresh tenants, projects and members from EZD-006's fixtures, removed in afterAll; switches set with
// setPermissions (section 3 harness); tokens from signIn (no email sent). Expected values: Decided
// "current_permissions SQL" (one row per active claim membership, keys and listed ids ordered, invoker,
// authenticated only), ARCH Row-level security (claims; 42501 on an ended session; two active memberships
// give no tenant claim), the primary keys of user_permission (EZD-101) and membership_project (EZD-005a),
// and Decided "broadcast SQL" (one user_permission.updated {} per member per statement, EZD-018 T23).
// Realtime waits: JOIN_WAIT_MS and QUIET_MS from app/test-harness/realtime/node-client.ts.
import { randomUUID } from 'node:crypto';
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
import {
  closeAllRealtime,
  connectRealtime,
  eventsNamed,
  JOIN_WAIT_MS,
  QUIET_MS,
  sleep,
  waitFor,
} from '../../../test-harness/realtime/node-client';

const EVENT = 'user_permission.updated';

async function sqlStateOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

// A plan names an index only as a whole identifier (L-008: bounded on both sides).
const namesIndex = (plan: string, index: string) =>
  new RegExp(`(^|[^a-z0-9_])${index}([^a-z0-9_]|$)`).test(plan);

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

  it('D3 indexed: both inner reads use the primary keys', async () => {
    const id = randomUUID();
    const plans = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe('set local enable_seqscan = off');
      const up = await tx.unsafe(
        `explain select up.permission_key from public.user_permission up where up.membership_id = '${id}'::uuid and up.granted order by up.permission_key`,
      );
      const mp = await tx.unsafe(
        `explain select mp.project_id from public.membership_project mp where mp.membership_id = '${id}'::uuid order by mp.project_id`,
      );
      const text = (rows: readonly Record<string, unknown>[]) =>
        rows.map((r) => String(r['QUERY PLAN'])).join('\n');
      return { up: text(up), mp: text(mp) };
    });
    expect(namesIndex(plans.up, 'user_permission_pkey'), plans.up).toBe(true);
    expect(namesIndex(plans.mp, 'membership_project_pkey'), plans.mp).toBe(true);
  });

  it('D5 broadcast: one user_permission.updated {} per statement on the member channel', async () => {
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const rt = await connectRealtime((await signIn(m.email)).accessToken);
    const own = rt.join(`user:${m.appUserId}`);
    expect(await own.joined).toBe('SUBSCRIBED');
    // Nothing from the setup may still be on its way.
    await sleep(QUIET_MS);
    const sql = harnessSql();

    const steps: Array<[string, () => Promise<unknown>]> = [
      [
        '(a) update one switch',
        () => sql`
          update public.user_permission set granted = true
          where membership_id = ${m.membershipId}::uuid and permission_key = 'edit_model'`,
      ],
      [
        '(b) one statement updating all 37',
        async () => {
          const r = await sql`
            update public.user_permission set granted = not granted
            where membership_id = ${m.membershipId}::uuid`;
          expect(r.count).toBe(37);
        },
      ],
      [
        '(c) delete one row',
        () => sql`
          delete from public.user_permission
          where membership_id = ${m.membershipId}::uuid and permission_key = 'edit_model'`,
      ],
      [
        '(d) insert it back',
        () => sql`
          insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
          values (${tenant}::uuid, ${m.membershipId}::uuid, 'edit_model', true)`,
      ],
    ];

    for (const [name, run] of steps) {
      const before = eventsNamed(own, EVENT).length;
      await run();
      await waitFor(() => eventsNamed(own, EVENT).length > before, JOIN_WAIT_MS);
      await sleep(QUIET_MS);
      const arrived = eventsNamed(own, EVENT).slice(before);
      expect(arrived, name).toHaveLength(1);
      expect(arrived[0].payload, name).toEqual({});
    }
  }, 90000);
});
