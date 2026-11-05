// EZD-117a R1, R2 (vault/plans/EZD-117a.md section 4; AC-EZD-117a-1, -3, -7). next/headers is mocked and members
// sign in as in app/src/app/api/settings/customers/route.test.ts. Expected values: Decided "Routes" (401
// `not_signed_in`, 403 `permission_denied` / `error.not_authorized`, 400 `invalid_input`, 200 `ProjectPage` or
// `ProjectCounts`, `Cache-Control: no-store` on every response), "Query params", "Cursor", fixture S, Q-0202.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../test-harness/permissions/grant';
import {
  seedFixtureS,
  seedGenerated,
  type FixtureKey,
} from '../../../../test-harness/projects-fixture';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
} from '../../../../test-harness/rls/fixtures';
import { encodeCursor } from '../../../server/projects/projects';
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

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };
const D1 = { all: 6, draft: 2, client_review: 1, permit_submitted: 1, approved: 1, in_build: 1 };

async function call(path: string, query = ''): Promise<{ res: Response; json: unknown }> {
  const url = `http://localhost/api/projects${path}${query}`;
  const mod = path === '' ? await import('./route') : await import('./counts/route');
  const res = await (mod.GET as (r: Request) => Promise<Response>)(new Request(url));
  return { res, json: await res.json() };
}

describe('EZD-117a projects routes', () => {
  let P: Record<FixtureKey, string>;
  let owner: Map<string, string>;
  let listed: Map<string, string>;
  let noperm: Map<string, string>;
  let big: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    P = await seedFixtureS(tenant);
    const m1 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m1.membershipId, ['view_projects']);
    const m2 = await createMember({ tenantId: tenant, scope: 'listed', listed: [P.P3, P.P4] });
    await setPermissions(tenant, m2.membershipId, ['view_projects']);
    const m3 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m3.membershipId, []);
    // Paging tenant: 60 generated projects, updated_at i minutes back, so the edited order is 'gen 1' ... 'gen 60'.
    const tl = await createTenant();
    await seedGenerated(tl, 60);
    const m4 = await createMember({ tenantId: tl, scope: 'all' });
    await setPermissions(tl, m4.membershipId, ['view_projects']);
    big = await cookiesFor(m4.email);
    owner = await cookiesFor(m1.email);
    listed = await cookiesFor(m2.email);
    noperm = await cookiesFor(m3.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 GET /api/projects: 401, 403, 400 four times, a 200 page, and page 2 from next', async () => {
    const all: Response[] = [];
    state.store = new Map();
    const a = await call('');
    all.push(a.res);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(noperm);
    const b = await call('');
    all.push(b.res);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    state.store = new Map(owner);
    const c = await call('', '?status=bogus');
    all.push(c.res);
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(INVALID);

    state.store = new Map(owner);
    const d = await call('', '?after=!!');
    all.push(d.res);
    expect(d.res.status).toBe(400);
    expect(d.json).toEqual(INVALID);

    const K = {
      id: '3f2a6c1e-8b4d-4e2a-9c1f-0a1b2c3d4e5f',
      u: '2026-10-01T12:00:00.123456+00:00',
      n: 'alpha',
      m: false,
      c: 'acme',
      r: 5,
      o: 2147483647,
    };
    for (const bad of [
      { ...K, o: 2147483648 },
      { ...K, u: '0000-01-01T00:00:00Z' },
    ]) {
      state.store = new Map(owner);
      const x = await call('', `?after=${encodeCursor(bad)}`);
      all.push(x.res);
      expect(x.res.status).toBe(400);
      expect(x.json).toEqual(INVALID);
    }

    state.store = new Map(owner);
    const e = await call('');
    all.push(e.res);
    expect(e.res.status).toBe(200);
    const page = e.json as { items: { id: string }[]; next: string | null };
    expect(page.items.map((i) => i.id)).toEqual([P.P4, P.P1, P.P2, P.P3, P.P5, P.P6]);
    expect(page.next).toBeNull();

    state.store = new Map(big);
    const f = await call('');
    all.push(f.res);
    const first = f.json as { items: { name: string }[]; next: string | null };
    expect(f.res.status).toBe(200);
    expect(first.items).toHaveLength(48);
    expect(first.next).not.toBeNull();

    state.store = new Map(big);
    const g = await call('', `?after=${first.next}`);
    all.push(g.res);
    expect(g.res.status).toBe(200);
    const second = g.json as { items: { name: string }[]; next: string | null };
    expect([...first.items, ...second.items].map((i) => i.name)).toEqual(
      Array.from({ length: 60 }, (_, i) => `gen ${i + 1}`),
    );
    expect(second.next).toBeNull();

    for (const r of all) expect(r.headers.get('cache-control') ?? '').toContain('no-store');
  });

  it('R2 GET /api/projects/counts: 401, 403, the owner counts, the listed counts', async () => {
    const all: Response[] = [];
    state.store = new Map();
    const a = await call('/counts');
    all.push(a.res);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(noperm);
    const b = await call('/counts');
    all.push(b.res);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    state.store = new Map(owner);
    const c = await call('/counts');
    all.push(c.res);
    expect(c.res.status).toBe(200);
    expect(c.json).toEqual(D1);

    state.store = new Map(listed);
    const d = await call('/counts');
    all.push(d.res);
    expect(d.res.status).toBe(200);
    expect(d.json).toEqual({
      all: 2,
      draft: 1,
      client_review: 0,
      permit_submitted: 0,
      approved: 0,
      in_build: 1,
    });

    for (const r of all) expect(r.headers.get('cache-control') ?? '').toContain('no-store');
  });
});
