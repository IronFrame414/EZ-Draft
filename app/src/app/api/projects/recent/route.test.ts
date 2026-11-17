// EZD-128 R1, R2 (vault/plans/EZD-128.md section 4; AC-EZD-128-2). Same sign-in and `next/headers` mock as
// app/src/app/api/projects/[id]/model/route.test.ts. Expected values: section 3 route row (200 `{ items }`, at
// most 8, newest first, the `exclude` project left out (Q-0726), `exclude` any case; 400 `invalid_input` for an
// empty, malformed or repeated `exclude`; 401; 403 `permission_denied`; `no-store`), fixture S (P1 bravo / Zed
// Co, P3 charlie / acme).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import { seedFixtureS, type FixtureKey } from '../../../../../test-harness/projects-fixture';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';

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

async function read(query: string): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/recent${query}`));
  return { res, json: JSON.parse(await res.text()) };
}

describe('EZD-128 recent projects route', () => {
  let P: Record<FixtureKey, string>;
  let ownerCookies: Map<string, string>;
  let noViewCookies: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    P = await seedFixtureS(tenant);
    const owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['view_projects', 'edit_model']);
    const noView = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, noView.membershipId, ['edit_model']);
    const sql = harnessSql();
    await sql`insert into public.project_recent (tenant_id, membership_id, project_id, opened_at) values
      (${tenant}::uuid, ${owner.membershipId}::uuid, ${P.P1}::uuid, '2026-11-01T10:00:00Z'),
      (${tenant}::uuid, ${owner.membershipId}::uuid, ${P.P3}::uuid, '2026-11-01T11:00:00Z')`;
    ownerCookies = await cookiesFor(owner.email);
    noViewCookies = await cookiesFor(noView.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 answers the recent list, the excluded project left out', async () => {
    state.store = new Map(ownerCookies);
    const a = await read(`?exclude=${P.P1.toUpperCase()}`);
    expect(a.res.status).toBe(200);
    expect(a.res.headers.get('cache-control')).toContain('no-store');
    expect(a.json).toEqual({ items: [{ id: P.P3, name: 'charlie', clientName: 'acme' }] });

    const b = await read('');
    expect(b.res.status).toBe(200);
    expect((b.json as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([P.P3, P.P1]);
    expect((b.json as { items: unknown[] }).items[1]).toEqual({
      id: P.P1,
      name: 'bravo',
      clientName: 'Zed Co',
    });
  }, 120000);

  it('R2 answers 401, 403 and 400 invalid_input', async () => {
    state.store = new Map();
    const out = await read('');
    expect(out.res.status).toBe(401);
    expect(out.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(noViewCookies);
    const denied = await read('');
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual(FORBIDDEN);

    state.store = new Map(ownerCookies);
    for (const q of ['?exclude=', '?exclude=not-a-uuid', `?exclude=${P.P1}&exclude=${P.P3}`]) {
      const r = await read(q);
      expect(r.res.status, q).toBe(400);
      expect(r.res.headers.get('cache-control')).toContain('no-store');
      expect(r.json).toEqual(INVALID);
    }
  }, 120000);
});
