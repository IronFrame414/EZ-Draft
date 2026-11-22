// EZD-417 (03c edge_profile "tenant_id, name, section_svg, no stored per-LF price | Library: eased, bevel, half
// bullnose, full bullnose, ogee, mitered apron, custom"; S04b Controls "Edge profile card | Pick profile from library:
// eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom"; CLAUDE.md rule 4). Expected values: the
// seven names in the spec's order, seeded on a company's first library read; one company never reads or changes
// another company's profiles; members write no profile directly (the settings page is EZD-1617).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from './database.types';
import { listEdgeProfiles } from '../countertops/edge-profiles';

const NAMES = ['Eased', 'Bevel', 'Half bullnose', 'Full bullnose', 'Ogee', 'Mitered apron', 'Custom'];
const KEYS = ['eased', 'bevel', 'half_bullnose', 'full_bullnose', 'ogee', 'mitered_apron', 'custom'];

const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

describe('EZD-417 edge_profile (database)', () => {
  let tenant = '';
  let otherTenant = '';
  let s: Session;
  let otherS: Session;

  beforeAll(async () => {
    tenant = await createTenant();
    otherTenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model', 'send_to_client', 'see_sell_prices']);
    const o = await createMember({ tenantId: otherTenant, scope: 'all' });
    await setPermissions(otherTenant, o.membershipId, ['view_projects', 'edit_model']);
    s = await signIn(m.email);
    otherS = await signIn(o.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('edge_profile', {
    makeRow: (t) => ({ tenant_id: t, key: 'custom', name: 'Iso edge', section_svg: '<svg/>', position: 6 }),
  });

  it("a company's first library read gives it the seven profiles, in order, each with a section drawing", async () => {
    const before = await harnessSql()`select 1 from public.edge_profile where tenant_id = ${tenant}::uuid`;
    expect(before).toHaveLength(0);
    await listEdgeProfiles(db(s));
    await listEdgeProfiles(db(s));
    const rows = await harnessSql()<{ key: string; name: string; section_svg: string }[]>`
      select key, name, section_svg from public.edge_profile where tenant_id = ${tenant}::uuid order by position`;
    expect(rows.map((r) => r.key)).toEqual(KEYS);
    expect(rows.map((r) => r.name)).toEqual(NAMES);
    for (const r of rows) expect(r.section_svg).toMatch(/^<svg [^>]*viewBox="0 0 60 40"><path d="M[^"]+"/);
  });

  it('the profile holds no price column', async () => {
    const cols = await harnessSql()<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'edge_profile'`;
    for (const c of cols) expect(c.column_name).not.toMatch(/price|rate|cost/);
  });

  it("a member reads only their own company's profiles", async () => {
    const mine = await listEdgeProfiles(db(s));
    const theirs = await listEdgeProfiles(db(otherS));
    expect(mine.map((p) => p.name)).toEqual(NAMES);
    expect(theirs.map((p) => p.name)).toEqual(NAMES);
    const own = await harnessSql()<{ id: string }[]>`
      select id::text from public.edge_profile where tenant_id = ${tenant}::uuid`;
    const ownIds = new Set(own.map((r) => r.id));
    expect(mine.every((p) => ownIds.has(p.id))).toBe(true);
    expect(theirs.some((p) => ownIds.has(p.id))).toBe(false);
  });

  it("one company cannot change or delete another company's profile, nor add one to it", async () => {
    const [target] = await harnessSql()<{ id: string }[]>`
      select id::text from public.edge_profile where tenant_id = ${tenant}::uuid and key = 'ogee'`;
    const upd = await otherS.serverDb.from('edge_profile').update({ name: 'Taken' }).eq('id', target!.id).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await otherS.serverDb.from('edge_profile').delete().eq('id', target!.id).select();
    expect(del.data ?? []).toEqual([]);
    const ins = await otherS.serverDb
      .from('edge_profile')
      .insert({ tenant_id: tenant, key: 'custom', name: 'X', section_svg: '<svg/>', position: 9 });
    expect(ins.error?.code).toBe('42501');
    const [after] = await harnessSql()<{ name: string }[]>`
      select name from public.edge_profile where id = ${target!.id}::uuid`;
    expect(after!.name).toBe('Ogee');
  });

  it('a member cannot write their own library directly (no member write path before EZD-1617)', async () => {
    const [target] = await harnessSql()<{ id: string }[]>`
      select id::text from public.edge_profile where tenant_id = ${tenant}::uuid and key = 'eased'`;
    const upd = await s.serverDb.from('edge_profile').update({ name: 'Changed' }).eq('id', target!.id).select();
    expect(upd.data ?? []).toEqual([]);
    const ins = await s.serverDb
      .from('edge_profile')
      .insert({ tenant_id: tenant, key: 'custom', name: 'X', section_svg: '<svg/>', position: 9 });
    expect(ins.error?.code).toBe('42501');
  });

  it('the browser client without the gate header reads nothing', async () => {
    const r = await s.browserDb.from('edge_profile').select('id');
    expect(r.data ?? []).toEqual([]);
  });
});
