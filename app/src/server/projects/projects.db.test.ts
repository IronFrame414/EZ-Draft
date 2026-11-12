// EZD-117a D1-D7 (vault/plans/EZD-117a.md section 4; AC-EZD-117a-1, -3, -4, -6, -7). Expected values: fixture S
// (app/test-harness/projects-fixture.ts); Q-0201 (archived never counted or listed); Q-0202 (a listed member sees
// only listed projects); S01 Controls (status filter); Decided "Sort orders" (D4 literal ids; D5 a JS sort of the
// rows read back), "Paging" (48 per page, keyset, next null on the last page), "listProjects" and "Client shown"
// (one rpc call and no .from call; the customer name, null without a customer). Calls go through the gated
// serverDb of `signIn` (RLS applies).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { seedFixtureS, type FixtureKey } from '../../../test-harness/projects-fixture';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import type { ProjectSort, ProjectTab } from '../../lib/projects/projects';
import {
  countProjects,
  decodeCursor,
  encodeCursor,
  listProjects,
  type ProjectCursor,
} from './projects';

const typed = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;
const D1 = { all: 6, draft: 2, client_review: 1, permit_submitted: 1, approved: 1, in_build: 1 };
const ids = (a: string, b: string) => [a.toLowerCase(), b.toLowerCase()].sort();

async function walk(s: Session, tab: ProjectTab, sort: ProjectSort) {
  const pages: string[][] = [];
  let after = null as ReturnType<typeof decodeCursor>;
  let last: string | null = null;
  for (let guard = 0; guard < 10; guard++) {
    const page = await listProjects(typed(s), { tab, sort, after });
    pages.push(page.items.map((i) => i.id));
    last = page.next;
    if (page.next === null) break;
    after = decodeCursor(page.next);
    expect(after).not.toBeNull();
  }
  return { pages, last };
}

describe('EZD-117a list and count projects', () => {
  let P: Record<FixtureKey, string>;
  let owner: Session;
  let listed: Session;
  let big: Session;
  let tl = '';

  const list = (s: Session, tab: ProjectTab, sort: ProjectSort) =>
    listProjects(typed(s), { tab, sort, after: null }).then((p) => p.items.map((i) => i.id));

  beforeAll(async () => {
    const tenant = await createTenant();
    const other = await createTenant();
    await createProjects(other, 2);
    P = await seedFixtureS(tenant);
    const m1 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m1.membershipId, ['view_projects']);
    owner = await signIn(m1.email);
    const m2 = await createMember({ tenantId: tenant, scope: 'listed', listed: [P.P3, P.P4] });
    await setPermissions(tenant, m2.membershipId, ['view_projects']);
    listed = await signIn(m2.email);

    // D5: tenant L, 100 projects. Customer by i % 2 (0 = Able, 1 = baker), none when i % 3 = 0.
    tl = await createTenant();
    const sql = harnessSql();
    const able = (
      await sql<{ id: string }[]>`insert into public.customer (tenant_id, name, email)
        values (${tl}::uuid, 'Able', 'able@example.test') returning id`
    )[0].id;
    const baker = (
      await sql<{ id: string }[]>`insert into public.customer (tenant_id, name, email)
        values (${tl}::uuid, 'baker', 'baker@example.test') returning id`
    )[0].id;
    await sql`
      insert into public.project
        (tenant_id, name, address, type, status, open_items_count, updated_at, customer_id)
      select ${tl}::uuid, 'item' || lpad((i % 37)::text, 2, '0'), i || ' Page St', 'kitchen',
        (array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build'])[((i - 1) % 5) + 1],
        i % 4, timestamptz '2026-10-01T12:00Z' - (i % 50) * interval '1 hour',
        case when i % 3 = 0 then null when i % 2 = 0 then ${able}::uuid else ${baker}::uuid end
      from generate_series(1, 100) i`;
    const m3 = await createMember({ tenantId: tl, scope: 'all' });
    await setPermissions(tl, m3.membershipId, ['view_projects']);
    big = await signIn(m3.email);
  }, 180000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('D1 counts: archived projects and other companies are not counted', async () => {
    expect(await countProjects(typed(owner))).toEqual(D1);
  });

  it('D2 a listed member counts and lists only the listed projects', async () => {
    expect(await countProjects(typed(listed))).toEqual({
      all: 2,
      draft: 1,
      client_review: 0,
      permit_submitted: 0,
      approved: 0,
      in_build: 1,
    });
    expect(await list(listed, 'all', 'edited')).toEqual([P.P4, P.P3]);
  });

  it('D3 a status tab lists only that status', async () => {
    expect(await list(owner, 'draft', 'edited')).toEqual([P.P2, P.P3]);
  });

  it('D4 every sort order', async () => {
    expect(await list(owner, 'all', 'edited')).toEqual([P.P4, P.P1, P.P2, P.P3, P.P5, P.P6]);
    expect(await list(owner, 'all', 'name')).toEqual([P.P2, P.P1, P.P3, P.P4, P.P5, P.P6]);
    expect(await list(owner, 'all', 'client')).toEqual([
      ...ids(P.P3, P.P6),
      P.P4,
      P.P1,
      ...ids(P.P2, P.P5),
    ]);
    expect(await list(owner, 'all', 'status')).toEqual([P.P2, P.P3, P.P5, P.P6, P.P1, P.P4]);
    expect(await list(owner, 'all', 'open_items')).toEqual([P.P3, P.P4, P.P2, P.P6, P.P1, P.P5]);
  });

  it('D5 paging: 48, 48, 4, no repeats, and each sort equals a JS sort of the rows', async () => {
    const rows = await harnessSql()<
      { id: string; name: string; client: string | null; status: string; open: number; u: Date }[]
    >`select p.id, p.name, c.name as client, p.status, p.open_items_count as open, p.updated_at as u
      from public.project p
      left join public.customer c on c.id = p.customer_id
      where p.tenant_id = ${tl}::uuid`;
    expect(rows).toHaveLength(100);
    const STATUS = ['draft', 'client_review', 'permit_submitted', 'approved', 'in_build'];
    const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
    const edited = (a: (typeof rows)[0], b: (typeof rows)[0]) =>
      cmp(b.u.getTime(), a.u.getTime()) || cmp(b.id, a.id);
    const orders: Record<ProjectSort, (a: (typeof rows)[0], b: (typeof rows)[0]) => number> = {
      edited,
      name: (a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()) || cmp(a.id, b.id),
      client: (a, b) =>
        cmp(a.client === null ? 1 : 0, b.client === null ? 1 : 0) ||
        cmp((a.client ?? '').toLowerCase(), (b.client ?? '').toLowerCase()) ||
        cmp(a.id, b.id),
      status: (a, b) => cmp(STATUS.indexOf(a.status), STATUS.indexOf(b.status)) || edited(a, b),
      open_items: (a, b) => cmp(b.open, a.open) || edited(a, b),
    };
    for (const sort of ['edited', 'name', 'client', 'status', 'open_items'] as const) {
      const { pages, last } = await walk(big, 'all', sort);
      expect(pages.map((p) => p.length)).toEqual([48, 48, 4]);
      expect(last).toBeNull();
      const all = pages.flat();
      expect(new Set(all).size).toBe(100);
      expect(all).toEqual([...rows].sort(orders[sort]).map((r) => r.id));
    }
  });

  it('D6 one rpc call per read, no .from, and the card fields', async () => {
    const rpc = vi.spyOn(owner.serverDb, 'rpc');
    const from = vi.spyOn(owner.serverDb, 'from');
    const page = await listProjects(typed(owner), { tab: 'all', sort: 'edited', after: null });
    const p3 = page.items.find((i) => i.id === P.P3);
    const p2 = page.items.find((i) => i.id === P.P2);
    expect(p3).toEqual({
      id: P.P3,
      name: 'charlie',
      clientName: 'acme',
      address: '3 Sort St',
      status: 'draft',
      openItems: 5,
      hasThumbnail: false,
    });
    expect(p2?.clientName).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('list_projects');
    expect(rpc.mock.calls[0][1]).toEqual({ p_sort: 'edited' });
    expect(from).not.toHaveBeenCalled();

    rpc.mockClear();
    await countProjects(typed(owner));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('count_projects');
    expect(from).not.toHaveBeenCalled();
  });

  it('D7 cursor extremes: the low and high cursors resolve for all 5 sorts', async () => {
    const low: ProjectCursor = {
      id: '00000000-0000-0000-0000-000000000000',
      u: '0001-01-01T00:00:00Z',
      n: '',
      m: false,
      c: '',
      r: 1,
      o: 0,
    };
    const high: ProjectCursor = {
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      u: '9999-12-31T23:59:59.999999-15:59',
      n: '\u0001'.repeat(500),
      m: true,
      c: '漢'.repeat(500),
      r: 5,
      o: 2147483647,
    };
    let calls = 0;
    for (const cursor of [low, high]) {
      const after = decodeCursor(encodeCursor(cursor));
      expect(after).not.toBeNull();
      for (const sort of ['edited', 'name', 'client', 'status', 'open_items'] as ProjectSort[]) {
        await expect(
          listProjects(typed(owner), { tab: 'all', sort, after }),
        ).resolves.toBeDefined();
        calls++;
      }
    }
    expect(calls).toBe(10);
  });
});
