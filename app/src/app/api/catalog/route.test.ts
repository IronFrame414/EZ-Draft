// EZD-401 (S09 Permissions "View catalog drawer: View projects", Data shown; 03c catalog_item; R23;
// AC-EZD-401-1). The picker list route, signed in as in app/src/app/api/settings/libraries/routes.test.ts.
// Expected values: 401 `not_signed_in`, 403 `permission_denied` (`error.not_authorized`) without View projects,
// then the own company's items only: the 42 R23 seed items in line Generic plus one added item, and no cost,
// sell or markup key (prices on the picker are phase 16; S09 Permissions).
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

type Item = Record<string, unknown> & { model: string | null; line: string | null; category: string };

describe('EZD-401 GET /api/catalog', () => {
  let tenantA = '';
  let tenantB = '';
  let viewer = new Map<string, string>();
  let noView = new Map<string, string>();

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    for (const t of [tenantA, tenantB]) {
      await harnessSql()`select private.seed_catalog_generic_line(${t}::uuid)`;
    }
    const a = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, a.membershipId, ['view_projects']);
    const n = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, n.membershipId, ['edit_catalog']);
    viewer = await cookiesFor(a.email);
    noView = await cookiesFor(n.email);
    await harnessSql()`insert into public.catalog_item
      (tenant_id, category, name, model, unit_cost, sell_price, markup_pct)
      values (${tenantA}::uuid, 'tile', 'Subway 3x6', 'ST36', 1.25, 1.75, 40)`;
    await harnessSql()`insert into public.catalog_item (tenant_id, category, name)
      values (${tenantB}::uuid, 'tile', 'Other company tile')`;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('401 signed out, 403 without View projects', async () => {
    const out = await list();
    expect(out.res.status).toBe(401);
    expect(out.json).toEqual({ error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } });
    state.store = new Map(noView);
    const denied = await list();
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });
  });

  it('200 lists the own company seed line and items, with no money keys', async () => {
    state.store = new Map(viewer);
    const { res, json } = await list();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const items = json.items as Item[];
    expect(items.length).toBe(43);
    const generic = items.filter((i) => i.category === 'cabinets' && i.line === 'Generic');
    expect(generic.length).toBe(42);
    const tile = items.filter((i) => i.category === 'tile');
    expect(tile.map((i) => i.name)).toEqual(['Subway 3x6']);
    expect(items.find((i) => i.model === 'SB36')).toMatchObject({
      subcategory: 'sink_base',
      width: 36,
      depth: 24,
      height: 34.5,
    });
    for (const i of items) {
      expect(Object.keys(i).sort()).toEqual(
        [
          'brand',
          'category',
          'depth',
          'finish',
          'height',
          'id',
          'line',
          'model',
          'name',
          'subcategory',
          'width',
        ].sort(),
      );
    }
  });
});
