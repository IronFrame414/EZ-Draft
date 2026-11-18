// EZD-406 (S04 Permissions "See company costs: Cost row in the inspector Catalog section"; S04 Controls "Catalog >
// Cost | Display "$… · internal" | Hidden without See company costs"; AC-EZD-406-2). GET /api/catalog signed in as
// in route.test.ts. Expected values: the item inserted here with unit_cost 1.25 comes back with unitCost 1.25 for a
// member with See company costs; a member without it gets no unitCost (nor any cost, sell or markup) key at all.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
} from '../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../server/auth/supabase-server';
const state = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

function jarOver(store: Map<string, string>): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const { error } = await createSessionClient(jarOver(store)).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}

async function list() {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, json: (await res.json()) as Record<string, unknown> };
}

type Item = Record<string, unknown> & { model: string | null };

describe('EZD-406 GET /api/catalog cost for the box inspector', () => {
  let costs = new Map<string, string>();
  let noCosts = new Map<string, string>();

  beforeAll(async () => {
    const tenant = await createTenant();
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, ['view_projects', 'see_company_costs']);
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, ['view_projects', 'see_sell_prices']);
    costs = await cookiesFor(a.email);
    noCosts = await cookiesFor(b.email);
    await harnessSql()`insert into public.catalog_item
      (tenant_id, category, subcategory, line, name, model, width, depth, height, unit_cost, sell_price, markup_pct)
      values (${tenant}::uuid, 'cabinets', 'sink_base', 'Shaker', 'Sink base', 'SB36', 36, 24, 34.5, 1.25, 1.75, 40),
             (${tenant}::uuid, 'cabinets', 'base', 'Shaker', 'Base, 1 door', 'B18', 18, 24, 34.5, null, null, null)`;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('a member with See company costs gets each item cost; null when none is on record', async () => {
    state.store = new Map(costs);
    const { res, json } = await list();
    expect(res.status).toBe(200);
    const items = json.items as Item[];
    expect(items.find((i) => i.model === 'SB36')?.unitCost).toBe(1.25);
    const b18 = items.find((i) => i.model === 'B18');
    expect(b18).toHaveProperty('unitCost', null);
    for (const i of items) {
      expect(i).not.toHaveProperty('sellPrice');
      expect(i).not.toHaveProperty('sell_price');
      expect(i).not.toHaveProperty('markup_pct');
    }
  });

  it('a member without See company costs gets no cost key on any item', async () => {
    state.store = new Map(noCosts);
    const { res, json } = await list();
    expect(res.status).toBe(200);
    const items = json.items as Item[];
    expect(items.map((i) => i.model).sort()).toEqual(['B18', 'SB36']);
    for (const i of items) {
      expect(i).not.toHaveProperty('unitCost');
      expect(i).not.toHaveProperty('unit_cost');
    }
  });
});
