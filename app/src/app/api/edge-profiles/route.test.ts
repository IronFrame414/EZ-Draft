// EZD-417 (03c edge_profile; S04b Permissions "View projects: view ... profiles"; S04b Controls "Edge profile card |
// Pick profile from library: eased, bevel, half bullnose, full bullnose, ogee, mitered apron, custom"). Same sign-in
// and mocks as app/src/app/api/projects/[id]/plan-scale/route.test.ts. Expected values: 401 not_signed_in; 403
// without View projects; 200 with the company's seven profiles in library order; no price key; no-store.
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
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../server/auth/supabase-server';

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

async function get(): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, json: JSON.parse(await res.text()) as unknown };
}

describe('EZD-417 edge profile library route', () => {
  let tenant = '';
  let viewer: Map<string, string>;
  let nobody: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    await createTenant();
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, ['view_projects']);
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, []);
    viewer = await cookiesFor(a.email);
    nobody = await cookiesFor(b.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it("answers 401, 403 and the company's seven profiles", async () => {
    state.store = new Map();
    const a = await get();
    expect(a.res.status).toBe(401);
    expect(a.res.headers.get('cache-control')).toBe('no-store');

    state.store = new Map(nobody);
    const b = await get();
    expect(b.res.status).toBe(403);

    state.store = new Map(viewer);
    const c = await get();
    expect(c.res.status).toBe(200);
    expect(c.res.headers.get('cache-control')).toBe('no-store');
    const profiles = (c.json as { profiles: Array<{ id: string; key: string; name: string; sectionSvg: string }> })
      .profiles;
    expect(profiles.map((p) => p.name)).toEqual([
      'Eased',
      'Bevel',
      'Half bullnose',
      'Full bullnose',
      'Ogee',
      'Mitered apron',
      'Custom',
    ]);
    const own = await harnessSql()<{ id: string }[]>`
      select id::text from public.edge_profile where tenant_id = ${tenant}::uuid order by position`;
    expect(profiles.map((p) => p.id)).toEqual(own.map((r) => r.id));
    for (const p of profiles) {
      expect(Object.keys(p).sort()).toEqual(['id', 'key', 'name', 'sectionSvg']);
      expect(p.sectionSvg.startsWith('<svg ')).toBe(true);
    }
  }, 60000);
});
