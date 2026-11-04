// EZD-113 T3 (vault/plans/EZD-113.md section 4; AC-EZD-113-4, -6). Expected values: the ticket row (50 per
// page, project count from one grouped query); Decided "Order" (lower(name), id), "Search" (trimmed,
// case-insensitive substring of name or email, % _ \ literal), "Count" (active, archived, total; project
// count = projects the viewer can see), "listCustomers" (one rpc call with the three arguments, no
// client.from, result plus page and pageSize 50). Calls go through the gated serverDb of `signIn`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
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
import { listCustomers } from './customers';

const typed = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;
const pad = (n: number) => String(n).padStart(3, '0');

describe('EZD-113 list customers', () => {
  let owner: Session;
  let listed: Session;
  let projects: string[] = [];

  const list = (s: Session, q: string, archived = false, page = 1) =>
    listCustomers(typed(s), { q, archived, page });

  beforeAll(async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    projects = await createProjects(tenantA, 4);

    const sql = harnessSql();
    const rows = [
      ...Array.from({ length: 52 }, (_, i) => ({
        tenant_id: tenantA,
        name: `C${pad(i + 1)}`,
        email: `c${pad(i + 1)}@example.test`,
        archived_at: null as string | null,
      })),
      {
        tenant_id: tenantA,
        name: 'Pct 50% off',
        email: 'pct@example.test',
        archived_at: null,
      },
      {
        tenant_id: tenantA,
        name: 'Z1',
        email: 'z1@example.test',
        archived_at: new Date().toISOString(),
      },
      {
        tenant_id: tenantA,
        name: 'Z2',
        email: 'z2@example.test',
        archived_at: new Date().toISOString(),
      },
      { tenant_id: tenantB, name: 'C000', email: 'c000@example.test', archived_at: null },
    ];
    await sql`insert into public.customer ${sql(rows, 'tenant_id', 'name', 'email', 'archived_at')}`;
    const idOf = async (name: string) =>
      (
        await sql<{ id: string }[]>`
          select id from public.customer where tenant_id = ${tenantA}::uuid and name = ${name}`
      )[0].id;
    const c001 = await idOf('C001');
    const c002 = await idOf('C002');
    for (const p of projects.slice(0, 3))
      await sql`update public.project set customer_id = ${c001}::uuid where id = ${p}::uuid`;
    await sql`update public.project set customer_id = ${c002}::uuid where id = ${projects[3]}::uuid`;

    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['settings_company']);
    owner = await signIn(m1.email);
    const m2 = await createMember({ tenantId: tenantA, scope: 'listed', listed: [projects[0]] });
    await setPermissions(tenantA, m2.membershipId, ['settings_company']);
    listed = await signIn(m2.email);
  }, 180000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T3 page 1 holds 50 rows in name order with the counts and each row its project count', async () => {
    const rpc = vi.spyOn(owner.serverDb, 'rpc');
    const from = vi.spyOn(owner.serverDb, 'from');
    const page = await list(owner, '');
    expect(page.rows).toHaveLength(50);
    expect(page.total).toBe(53);
    expect(page.active).toBe(53);
    expect(page.archived).toBe(2);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(50);
    expect(page.rows.slice(0, 3).map((r) => [r.name, r.projectCount])).toEqual([
      ['C001', 3],
      ['C002', 1],
      ['C003', 0],
    ]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('list_customers', {
      p_search: '',
      p_archived: false,
      p_page: 1,
    });
    expect(from).not.toHaveBeenCalled();
    expect(page.rows.map((r) => r.name)).not.toContain('C000');
  });

  it('T3 page 2 holds the last three active customers', async () => {
    const page = await list(owner, '', false, 2);
    expect(page.rows.map((r) => r.name)).toEqual(['C051', 'C052', 'Pct 50% off']);
    expect(page.page).toBe(2);
  });

  it('T3 search is a case-insensitive substring of name or email, and % and _ match literally', async () => {
    expect((await list(owner, 'c05')).rows.map((r) => r.name)).toEqual(['C050', 'C051', 'C052']);
    expect((await list(owner, 'c05')).total).toBe(3);
    expect((await list(owner, 'C001@EXAMPLE')).rows.map((r) => r.name)).toEqual(['C001']);
    expect((await list(owner, '%')).rows.map((r) => r.name)).toEqual(['Pct 50% off']);
    const underscore = await list(owner, '_');
    expect(underscore.total).toBe(0);
    expect(underscore.rows).toEqual([]);
  });

  it('T3 the archived list holds the archived customers', async () => {
    const page = await list(owner, '', true);
    expect(page.rows.map((r) => r.name)).toEqual(['Z1', 'Z2']);
  });

  it('T3 a listed-scope member counts only the projects they can see', async () => {
    const page = await list(listed, 'C001@EXAMPLE');
    expect(page.rows.map((r) => [r.name, r.projectCount])).toEqual([['C001', 1]]);
  });

  it('T3 the function groups the project count in one grouped query', async () => {
    const rows = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from regexp_matches(
        lower(pg_get_functiondef('public.list_customers(text,boolean,integer)'::regprocedure)),
        'group by', 'g')`;
    expect(rows[0].n).toBe(1);
  });
});
