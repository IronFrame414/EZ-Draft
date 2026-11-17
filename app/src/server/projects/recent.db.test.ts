// EZD-128 D1-D6 (vault/plans/EZD-128.md section 4; AC-EZD-128-2). Expected values: fixture S
// (app/test-harness/projects-fixture.ts: P1 bravo / Zed Co, P2 Alpha / no client, P3 charlie / acme, P4 Delta /
// Mid, P5 echo, P7 archived); Q-0697 decisions 04 ("recent" = the projects this user opened, newest first,
// archived left out, can() scope); Q-0202 (a listed member sees only listed projects); Q-0568 (the benchmark
// project is in no project list); Q-0726 (the open project left out); Decided "List order" (ties by id,
// descending), "Limit" (1 to 20); Database functions table (42501, 22023, P0002). Calls go through the gated
// serverDb of `signIn`; rows with fixed times are written with harnessSql, never through sleeps.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { seedFixtureS, type FixtureKey } from '../../../test-harness/projects-fixture';
import {
  adminDb,
  cleanup,
  closeHarness,
  createAppUser,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import type { Database } from '../db/database.types';
import { listRecentProjects, recordProjectOpen } from './recent';

const T = { timeout: 60_000 };
const typed = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;
const lower = (a: string[]) => a.map((x) => x.toLowerCase());
const at = (hhmm: string) => `2026-11-01T${hhmm}:00Z`;

describe('EZD-128 recent projects', () => {
  let P: Record<FixtureKey, string>;
  let tenant = '';
  let tenantU = '';
  let projectU = '';
  let owner: Member;
  let listedM: Member;
  let other: Member;
  let memberU: Member;
  let ownerS: Session;
  let listedS: Session;
  let otherS: Session;
  let uS: Session;
  let loneS: Session;
  let bench = '';

  const put = async (m: Member, projectId: string, openedAt: string, tenantId = tenant) => {
    await harnessSql()`insert into public.project_recent (tenant_id, membership_id, project_id, opened_at)
      values (${tenantId}::uuid, ${m.membershipId}::uuid, ${projectId}::uuid, ${openedAt}::timestamptz)
      on conflict (membership_id, project_id) do update set opened_at = excluded.opened_at`;
  };
  const ids = async (s: Session, limit = 8, exclude: string | null = null) =>
    lower((await listRecentProjects(typed(s), { limit, exclude })).map((p) => p.id));

  beforeAll(async () => {
    tenant = await createTenant();
    P = await seedFixtureS(tenant);
    owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['view_projects', 'edit_model']);
    listedM = await createMember({ tenantId: tenant, scope: 'listed', listed: [P.P3, P.P4] });
    await setPermissions(tenant, listedM.membershipId, ['view_projects']);
    other = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, other.membershipId, ['view_projects']);
    tenantU = await createTenant();
    [projectU] = await createProjects(tenantU, 1);
    memberU = await createMember({ tenantId: tenantU, scope: 'all' });
    await setPermissions(tenantU, memberU.membershipId, ['view_projects']);
    const lone = await createAppUser();
    bench = (
      await harnessSql()<{ id: string }[]>`insert into public.project
        (tenant_id, name, address, type, is_benchmark)
        values (${tenant}::uuid, 'bench', '1 B St', 'kitchen', true) returning id`
    )[0].id;
    ownerS = await signIn(owner.email);
    listedS = await signIn(listedM.email);
    otherS = await signIn(other.email);
    uS = await signIn(memberU.email);
    loneS = await signIn(lone.email);
  }, 180_000);

  beforeEach(async () => {
    await harnessSql()`delete from public.project_recent where tenant_id in (${tenant}::uuid, ${tenantU}::uuid)`;
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  }, 180_000);

  it(
    'D1 newest first, ties by id descending, limit and exclude, with the client name',
    T,
    async () => {
      await put(owner, P.P1, at('10:00'));
      await put(owner, P.P3, at('11:00'));
      await put(owner, P.P4, at('12:00'));
      await put(owner, P.P2, at('12:00'));
      const tie = lower([P.P4, P.P2]).sort().reverse();
      const all = [...tie, ...lower([P.P3, P.P1])];
      expect(await ids(ownerS)).toEqual(all);
      expect(await ids(ownerS, 2)).toEqual(all.slice(0, 2));
      expect(await ids(ownerS, 8, P.P4)).toEqual(all.filter((id) => id !== P.P4.toLowerCase()));

      const items = await listRecentProjects(typed(ownerS), { limit: 8, exclude: null });
      const byId = new Map(items.map((i) => [i.id.toLowerCase(), i]));
      expect(byId.get(P.P3.toLowerCase())).toEqual({
        id: P.P3,
        name: 'charlie',
        clientName: 'acme',
      });
      expect(byId.get(P.P2.toLowerCase())).toEqual({ id: P.P2, name: 'Alpha', clientName: null });
    },
  );

  it('D2 a second open of the same project moves it up; one row per project', T, async () => {
    await recordProjectOpen(typed(ownerS), P.P1);
    const read = () => harnessSql()<
      { opened_at: Date }[]
    >`select opened_at from public.project_recent
      where membership_id = ${owner.membershipId}::uuid and project_id = ${P.P1}::uuid`;
    expect(await read()).toHaveLength(1);
    await harnessSql()`update public.project_recent set opened_at = ${at('09:00')}::timestamptz
      where membership_id = ${owner.membershipId}::uuid and project_id = ${P.P1}::uuid`;
    await recordProjectOpen(typed(ownerS), P.P1);
    const rows = await read();
    expect(rows).toHaveLength(1);
    expect(rows[0].opened_at.getTime()).toBeGreaterThan(new Date(at('09:00')).getTime());
    await harnessSql()`update public.project_recent set opened_at = ${at('09:00')}::timestamptz
      where membership_id = ${owner.membershipId}::uuid and project_id = ${P.P1}::uuid`;
    await recordProjectOpen(typed(ownerS), P.P3);
    expect(await ids(ownerS)).toEqual(lower([P.P3, P.P1]));
    await recordProjectOpen(typed(ownerS), P.P1);
    expect(await ids(ownerS)).toEqual(lower([P.P1, P.P3]));
  });

  it('D3 archived, benchmark, out-of-scope and other members never appear', T, async () => {
    await put(owner, P.P7, at('13:00'));
    await put(owner, P.P1, at('12:00'));
    await put(owner, bench, at('14:00'));
    await put(listedM, P.P1, at('12:00'));
    await put(listedM, P.P3, at('11:00'));
    await put(other, P.P5, at('10:00'));
    await put(memberU, projectU, at('10:00'), tenantU);
    expect(await ids(ownerS)).toEqual(lower([P.P1]));
    expect(await ids(listedS)).toEqual(lower([P.P3]));
    expect(await ids(otherS)).toEqual(lower([P.P5]));
    expect(await ids(uS)).toEqual(lower([projectU]));
  });

  it('D4 bounds and refusals', T, async () => {
    const list = (p_limit: number | null) =>
      typed(ownerS).rpc('list_recent_projects', { p_limit: p_limit as number });
    expect((await list(0)).error?.code).toBe('22023');
    expect((await list(21)).error?.code).toBe('22023');
    expect((await list(null)).error?.code).toBe('22023');
    await put(owner, P.P1, at('10:00'));
    await put(owner, P.P3, at('11:00'));
    const one = await list(1);
    expect(one.error).toBeNull();
    expect(one.data).toHaveLength(1);
    const twenty = await list(20);
    expect(twenty.error).toBeNull();
    expect(twenty.data).toHaveLength(2);

    const record = (s: Session, p: string | null) =>
      typed(s).rpc('record_project_open', { p_project: p as string });
    expect((await record(ownerS, null)).error?.code).toBe('22023');
    expect((await record(ownerS, projectU)).error?.code).toBe('P0002');
    expect((await record(listedS, P.P1)).error?.code).toBe('P0002');
    expect((await record(ownerS, randomUUID())).error?.code).toBe('P0002');
    expect((await record(loneS, P.P1)).error?.code).toBe('42501');
    const lone = await typed(loneS).rpc('list_recent_projects', { p_limit: 8 });
    expect(lone.error?.code).toBe('42501');
  });

  it('D5 rows go with their project and their membership', T, async () => {
    const [p2Copy] = await createProjects(tenant, 1);
    await put(owner, p2Copy, at('10:00'));
    await put(other, P.P5, at('10:00'));
    await put(other, P.P1, at('11:00'));
    expect((await adminDb().from('project').delete().eq('id', p2Copy)).error).toBeNull();
    const left = await harnessSql()<
      { n: number }[]
    >`select count(*)::int as n from public.project_recent
      where project_id = ${p2Copy}::uuid`;
    expect(left[0].n).toBe(0);
    const extra = await createMember({ tenantId: tenant, scope: 'all' });
    await put(extra, P.P5, at('10:00'));
    expect(
      (await adminDb().from('membership').delete().eq('id', extra.membershipId)).error,
    ).toBeNull();
    const gone = await harnessSql()<
      { n: number }[]
    >`select count(*)::int as n from public.project_recent
      where membership_id = ${extra.membershipId}::uuid`;
    expect(gone[0].n).toBe(0);
  });

  it('D7 no direct table access: a read sees no row and a write is refused', T, async () => {
    await put(owner, P.P1, at('10:00'));
    const read = await ownerS.serverDb.from('project_recent').select('project_id');
    expect(read.data ?? []).toEqual([]);
    const write = await ownerS.serverDb.from('project_recent').insert({
      tenant_id: tenant,
      membership_id: owner.membershipId,
      project_id: P.P3,
    });
    expect(write.error).not.toBeNull();
  });

  describeTenantIsolation('project_recent', {
    makeRow: (tenantId, ctx) => ({
      tenant_id: tenantId,
      membership_id: ctx.member.membershipId,
      project_id: ctx.projectIds[0],
    }),
  });
});
