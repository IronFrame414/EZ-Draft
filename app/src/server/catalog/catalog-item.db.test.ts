// EZD-401 (03c catalog_item; S09 Decisions 1 and 5; R23; CLAUDE.md rule 4; AC-EZD-401-1). Expected values: the
// R23 seed line (B, DB, SB and W in 3" steps from 9" to 36", fillers 3" and 6": 4 × 10 + 2 = 42 items), base-row
// depth 24" and height 34 1/2" (S04 Height), wall 12" × 30" (vault/build/assumptions.md EZD-401), the S09
// categories, an item saved to one project seen only within that project's scope (S09 Decision 5; EZD-006
// template), no member writes in this phase (S09 Add product is phase 16), and ARCH Row-level security
// (isolation harness).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { TENANT_1_ID } from '../../../test-utils/seed-ids';

const WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

async function codeOf(work: PromiseLike<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no_code';
  }
}

type Seeded = {
  model: string;
  subcategory: string;
  name: string;
  width: string;
  depth: string;
  height: string;
};

describe('EZD-401 catalog_item table', () => {
  let tenantA = '';
  let tenantB = '';

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    for (const t of [tenantA, tenantB]) {
      await harnessSql()`select private.seed_catalog_generic_line(${t}::uuid)`;
    }
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('catalog_item', {
    makeRow: (t) => ({ tenant_id: t, category: 'tile', name: 'Iso tile' }),
  });

  it('the local seed gives Worth Properties (tenant 1) the R23 line', async () => {
    const [{ n }] = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.catalog_item
      where tenant_id = ${TENANT_1_ID}::uuid and line = 'Generic'`;
    expect(n).toBe(42);
  });

  it('seeding a company gives it the R23 generic cabinet line, 42 items', async () => {
    const rows = await harnessSql()<(Seeded & { category: string; line: string })[]>`
      select category, line, model, subcategory, name, width::text, depth::text, height::text
      from public.catalog_item where tenant_id = ${tenantA}::uuid`;
    expect(rows.length).toBe(42);
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(['cabinets']));
    expect(new Set(rows.map((r) => r.line))).toEqual(new Set(['Generic']));
    const expected = [
      ...['B', 'DB', 'SB', 'W'].flatMap((p) => WIDTHS.map((w) => `${p}${w}`)),
      'F3',
      'F6',
    ].sort();
    expect(rows.map((r) => r.model).sort()).toEqual(expected);
    const by = new Map(rows.map((r) => [r.model, r]));
    const size = (m: string) => {
      const r = by.get(m)!;
      return [Number(r.width), Number(r.depth), Number(r.height), r.subcategory];
    };
    expect(size('B9')).toEqual([9, 24, 34.5, 'base']);
    expect(size('DB36')).toEqual([36, 24, 34.5, 'drawer_base']);
    expect(size('SB30')).toEqual([30, 24, 34.5, 'sink_base']);
    expect(size('W24')).toEqual([24, 12, 30, 'wall']);
    expect(size('F3')).toEqual([3, 24, 34.5, 'filler']);
    expect(size('F6')).toEqual([6, 24, 34.5, 'filler']);
  });

  it('seeding again adds nothing', async () => {
    await harnessSql()`select private.seed_catalog_generic_line(${tenantA}::uuid)`;
    const [{ n }] = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.catalog_item where tenant_id = ${tenantA}::uuid`;
    expect(n).toBe(42);
  });

  it('accepts the S09 categories only, a non-blank name and positive sizes', async () => {
    const insert = (category: string, name: string, width: number | null = null) =>
      harnessSql()`insert into public.catalog_item (tenant_id, category, name, width)
        values (${tenantA}::uuid, ${category}, ${name}, ${width})`;
    for (const c of [
      'cabinets',
      'countertops',
      'tile',
      'plumbing_fixtures',
      'lighting',
      'appliances',
      'hardware',
      'paint',
      'windows_doors',
    ]) {
      expect(await codeOf(insert(c, `Item ${c}`)), c).toBeNull();
    }
    expect(await codeOf(insert('furniture', 'Sofa'))).toBe('23514');
    expect(await codeOf(insert('tile', '  '))).toBe('23514');
    expect(await codeOf(insert('tile', 'Zero', 0))).toBe('23514');
  });

  it("a member reads their own company's items and none of another company's", async () => {
    const member = await createMember({ tenantId: tenantB, scope: 'all' });
    const session = await signIn(member.email);
    const { data, error } = await session.serverDb.from('catalog_item').select('tenant_id');
    expect(error).toBeNull();
    expect(data!.length).toBe(42);
    expect(new Set(data!.map((r) => r.tenant_id))).toEqual(new Set([tenantB]));
  });

  it('an item saved to one project is seen only by members who can see that project', async () => {
    const [listed, other] = await createProjects(tenantB, 2);
    await harnessSql()`insert into public.catalog_item (tenant_id, project_id, category, name)
      values (${tenantB}::uuid, ${other}::uuid, 'tile', 'One-off tile')`;
    const scoped = await createMember({ tenantId: tenantB, scope: 'listed', listed: [listed!] });
    const all = await createMember({ tenantId: tenantB, scope: 'all' });
    const names = async (email: string) => {
      const s = await signIn(email);
      const { data, error } = await s.serverDb
        .from('catalog_item')
        .select('name')
        .eq('category', 'tile');
      expect(error).toBeNull();
      return data!.map((r) => r.name);
    };
    expect(await names(scoped.email)).toEqual([]);
    expect(await names(all.email)).toEqual(['One-off tile']);
  });

  it('a member cannot add, change or delete items in this phase', async () => {
    const member = await createMember({ tenantId: tenantB, scope: 'all' });
    const s = await signIn(member.email);
    const ins = await s.serverDb
      .from('catalog_item')
      .insert({ tenant_id: tenantB, category: 'tile', name: 'Mine' });
    expect(ins.error?.code).toBe('42501');
    const upd = await s.serverDb
      .from('catalog_item')
      .update({ name: 'Renamed' })
      .eq('model', 'B9')
      .select('id');
    expect(upd.error).toBeNull();
    expect(upd.data).toEqual([]);
    const del = await s.serverDb.from('catalog_item').delete().eq('model', 'B9').select('id');
    expect(del.error).toBeNull();
    expect(del.data).toEqual([]);
  });
});
