// EZD-236 D1-D9 (vault/plans/EZD-236.md section 4, fixture T; AC-EZD-236-1, -3). Expected values: M1 (flag, guard,
// one-per-tenant index), M2 (list and count leave benchmark rows out), M3 (steps 1 to 8), P120a M4 and M5
// (floor trigger, permission and scope errors, change checks), P202 M1 (23503 level_not_found), Q-0568.
// D1, D3 and D7: confirm on pinned version (L-009; plan M3 `on conflict ... where`, nested `save_objects` gate,
// M1 `current_user` inside M3); these SQL fragments have not been run yet.
// Calls go through the gated serverDb of `signIn` (RLS applies); rows are read with harnessSql.
import { generateBenchmarkModel } from '@ezdraft/geometry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { benchmarkChanges } from './benchmark-project';

const T = { timeout: 60_000 };
const P = () => benchmarkChanges(generateBenchmarkModel());
const F1 = 'b0000000-0000-4000-8000-000000000001';
const F2 = 'b0000000-0000-4000-8000-000000000002';
const NOT_THERE = '3f2b8c1e-5d4a-4c7e-9b1a-0e6d2f4a8c10';
const FULL = ['view_projects', 'edit_model', 'settings_system_status'];

type Fix = { tenant: string; owner: Member; db: Session['serverDb'] };

async function fixtureT(
  permissions: string[] = FULL,
  scope: 'all' | 'listed' = 'all',
): Promise<Fix> {
  const tenant = await createTenant();
  const owner = await createMember({ tenantId: tenant, scope, listed: [] });
  await setPermissions(tenant, owner.membershipId, permissions as never);
  const s = await signIn(owner.email);
  return { tenant, owner, db: s.serverDb };
}

const call = (db: Fix['db'], changes: unknown = P()) =>
  db.rpc('create_benchmark_project', { p_changes: changes });

const projectCount = async (tenant: string) =>
  Number(
    (
      await harnessSql()<{ n: string }[]>`
        select count(*)::text as n from public.project where tenant_id = ${tenant}::uuid`
    )[0].n,
  );

describe('EZD-236 benchmark project (database)', () => {
  let t: Fix;

  beforeAll(async () => {
    t = await fixtureT();
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-236 D1 writes rows: the project, 3,000 objects, floors from the model', T, async () => {
    const { data, error } = await call(t.db);
    expect(error).toBeNull();
    const reply = data as { project_id: string; created: boolean };
    expect(reply.created).toBe(true);
    const sql = harnessSql();
    const [proj] = await sql<Record<string, unknown>[]>`
      select * from public.project where id = ${reply.project_id}::uuid`;
    expect(proj).toMatchObject({
      is_benchmark: true,
      tenant_id: t.tenant,
      name: 'Benchmark project',
      address: 'Generated for speed tests',
      type: 'whole_home_interior',
      status: 'draft',
      customer_id: null,
    });
    const rows = await sql<{ type: string; n: string }[]>`
      select type, count(*)::text as n from public.model_object
      where project_id = ${reply.project_id}::uuid and not deleted group by type`;
    expect(Object.fromEntries(rows.map((r) => [r.type, Number(r.n)]))).toEqual({
      floor: 2,
      wall: 1516,
      opening: 762,
      room: 720,
    });
    const floors = await sql<{ object_id: string }[]>`
      select object_id from public.model_object
      where project_id = ${reply.project_id}::uuid and type = 'floor' and not deleted
      order by object_id`;
    expect(floors.map((f) => f.object_id)).toEqual([F1, F2]);
    const [agg] = await sql<{ seqs: string[]; by: string[] }[]>`
      select array_agg(distinct updated_seq::text) as seqs, array_agg(distinct updated_by::text) as by
      from public.model_object where project_id = ${reply.project_id}::uuid and not deleted`;
    expect(agg.seqs).toEqual(['1']);
    expect(agg.by).toEqual([t.owner.appUserId]);
  });

  it('EZD-236 D2 second call: same project, created false, rows untouched', T, async () => {
    const first = (await call(t.db)).data as { project_id: string; created: boolean };
    const second = (await call(t.db)).data as { project_id: string; created: boolean };
    expect(second.project_id).toBe(first.project_id);
    expect(second.created).toBe(false);
    const [r] = await harnessSql()<{ n: string; seqs: string[] }[]>`
      select count(*)::text as n, array_agg(distinct updated_seq::text) as seqs
      from public.model_object where project_id = ${first.project_id}::uuid and not deleted`;
    expect(Number(r.n)).toBe(3000);
    expect(r.seqs).toEqual(['1']);
  });

  it('EZD-236 D3 race: two calls at once make one project', T, async () => {
    const f = await fixtureT();
    const [a, b] = await Promise.all([call(f.db), call(f.db)]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const ra = a.data as { project_id: string; created: boolean };
    const rb = b.data as { project_id: string; created: boolean };
    expect([ra.created, rb.created].sort()).toEqual([false, true]);
    expect(ra.project_id).toBe(rb.project_id);
    const sql = harnessSql();
    const [p] = await sql<{ n: string }[]>`
      select count(*)::text as n from public.project
      where tenant_id = ${f.tenant}::uuid and is_benchmark`;
    expect(Number(p.n)).toBe(1);
    const [o] = await sql<{ n: string }[]>`
      select count(*)::text as n from public.model_object
      where project_id = ${ra.project_id}::uuid and not deleted`;
    expect(Number(o.n)).toBe(3000);
  });

  it(
    'EZD-236 D4 permission: refused without System status, without edit_model, and when scope lists nothing',
    T,
    async () => {
      const cases: [string[], 'all' | 'listed', string][] = [
        [['view_projects', 'edit_model'], 'all', '42501'],
        [['view_projects', 'settings_system_status'], 'all', '42501'],
        [FULL, 'listed', 'P0002'],
      ];
      for (const [permissions, scope, code] of cases) {
        const f = await fixtureT(permissions, scope);
        const { error } = await call(f.db);
        expect(error?.code).toBe(code);
        expect(await projectCount(f.tenant)).toBe(0);
      }
    },
  );

  it('EZD-236 D5 bad changes roll back: nothing is kept', T, async () => {
    const noBaseSeq = P();
    delete (noBaseSeq[0] as Partial<(typeof noBaseSeq)[number]>).base_seq;
    const badLevel = P();
    badLevel[2] = { ...badLevel[2]!, data: { ...(badLevel[2]!.data as object), level: NOT_THERE } };
    const cases: [unknown, string][] = [
      [[], '22023'],
      [noBaseSeq, '22023'],
      [badLevel, '23503'],
    ];
    for (const [changes, code] of cases) {
      const f = await fixtureT();
      const { error } = await call(f.db, changes);
      expect(error?.code).toBe(code);
      if (code === '23503') expect(error?.message).toBe('level_not_found');
      expect(await projectCount(f.tenant)).toBe(0);
    }
  });

  it('EZD-236 D6 tenants apart: each caller gets a project of its own tenant', T, async () => {
    const b = await fixtureT();
    const ra = (await call(t.db)).data as { project_id: string };
    const rb = (await call(b.db)).data as { project_id: string };
    expect(ra.project_id).not.toBe(rb.project_id);
    const sql = harnessSql();
    const [x] = await sql<{ tenant_id: string }[]>`
      select tenant_id from public.project where id = ${ra.project_id}::uuid`;
    const [y] = await sql<{ tenant_id: string }[]>`
      select tenant_id from public.project where id = ${rb.project_id}::uuid`;
    expect(x.tenant_id).toBe(t.tenant);
    expect(y.tenant_id).toBe(b.tenant);
    const again = (await call(t.db)).data as { project_id: string; created: boolean };
    expect(again.project_id).toBe(ra.project_id);
    expect(again.created).toBe(false);
  });

  it(
    'EZD-236 D7 flag guard: a member cannot set or clear is_benchmark, ordinary writes pass',
    T,
    async () => {
      const f = await fixtureT();
      const bench = ((await call(f.db)).data as { project_id: string }).project_id;
      const [normal] = await createProjects(f.tenant, 1);
      const flag = async (id: string) =>
        (
          await harnessSql()<{ is_benchmark: boolean }[]>`
          select is_benchmark from public.project where id = ${id}::uuid`
        )[0].is_benchmark;

      const ins = await f.db
        .from('project')
        .insert({
          tenant_id: f.tenant,
          name: 'g',
          address: 'g',
          type: 'kitchen',
          is_benchmark: true,
        });
      const up1 = await f.db.from('project').update({ is_benchmark: true }).eq('id', normal!);
      const up2 = await f.db.from('project').update({ is_benchmark: false }).eq('id', bench);
      for (const r of [ins, up1, up2]) {
        expect(r.error?.code).toBe('42501');
        expect(r.error?.message).toBe('benchmark_flag_server_only');
      }
      expect(await flag(normal!)).toBe(false);
      expect(await flag(bench)).toBe(true);
      expect(await projectCount(f.tenant)).toBe(2);

      const ok1 = await f.db
        .from('project')
        .insert({ tenant_id: f.tenant, name: 'g', address: 'g', type: 'kitchen' });
      const ok2 = await f.db.from('project').update({ name: 'x' }).eq('id', bench);
      expect(ok1.error).toBeNull();
      expect(ok2.error).toBeNull();
    },
  );

  it('EZD-236 D8 off Projects: list and count leave the benchmark project out', T, async () => {
    const f = await fixtureT();
    const [normal] = await createProjects(f.tenant, 1);
    await call(f.db);
    const list = await f.db.rpc('list_projects', { p_sort: 'edited' });
    const count = await f.db.rpc('count_projects');
    const searchList = await f.db.rpc('list_projects', { p_sort: 'name', p_search: 'Benchmark' });
    const searchCount = await f.db.rpc('count_projects', { p_search: 'Benchmark' });
    expect(list.error).toBeNull();
    const items = (list.data as { items: { id: string }[] }).items;
    expect(items.map((i) => i.id.toLowerCase())).toEqual([normal!.toLowerCase()]);
    expect(count.data).toMatchObject({ all: 1, draft: 1 });
    expect((searchList.data as { items: unknown[] }).items).toEqual([]);
    expect((searchCount.data as { all: number }).all).toBe(0);
  });

  it('EZD-236 D9 one per tenant: a second benchmark row is a unique violation', T, async () => {
    const f = await fixtureT();
    await call(f.db);
    await expect(
      harnessSql()`
        insert into public.project (tenant_id, name, address, type, is_benchmark)
        values (${f.tenant}::uuid, 'b2', 'b2', 'kitchen', true)`,
    ).rejects.toMatchObject({ code: '23505' });
  });
});
