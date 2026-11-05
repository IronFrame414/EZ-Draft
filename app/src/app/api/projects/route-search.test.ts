// EZD-117b R1, R2 (vault/plans/EZD-117b.md section 4; AC-EZD-117b-1). next/headers is mocked and members sign in
// as in route.test.ts. Expected values: Decided "Routes" (`q` is trimmed; over 1000 characters is 400
// `invalid_input` / `error.invalid_input`; `Cache-Control: no-store` on every response; the counts route answers
// 401 without a session), fixture H (app/test-harness/projects-search-fixture.ts).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ownerMember,
  seedFixtureH,
  viewerMember,
} from '../../../../test-harness/projects-search-fixture';
import {
  adminDb,
  cleanup,
  closeHarness,
  createTenant,
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

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };

async function call(path: string, query = ''): Promise<{ res: Response; json: unknown }> {
  const url = `http://localhost/api/projects${path}${query}`;
  const mod = path === '' ? await import('./route') : await import('./counts/route');
  const res = await (mod.GET as (r: Request) => Promise<Response>)(new Request(url));
  return { res, json: await res.json() };
}

describe('EZD-117b projects routes with q', () => {
  let owner: Map<string, string>;
  let viewer: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    await seedFixtureH(tenant);
    owner = await cookiesFor((await ownerMember(tenant)).email);
    viewer = await cookiesFor((await viewerMember(tenant)).email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 GET /api/projects?q=: a match, a too long q, and a blank q', async () => {
    const all: Response[] = [];
    state.store = new Map(owner);
    const a = await call('', '?status=all&sort=edited&q=palm');
    all.push(a.res);
    expect(a.res.status).toBe(200);
    expect((a.json as { items: { name: string }[] }).items.map((i) => i.name)).toEqual([
      'Kitchen remodel',
    ]);

    state.store = new Map(owner);
    const b = await call('', `?q=${'a'.repeat(1001)}`);
    all.push(b.res);
    expect(b.res.status).toBe(400);
    expect(b.json).toEqual(INVALID);

    state.store = new Map(owner);
    const c = await call('', '?q=%20%20');
    all.push(c.res);
    expect(c.res.status).toBe(200);
    expect((c.json as { items: unknown[] }).items).toHaveLength(5);

    for (const r of all) expect(r.headers.get('cache-control') ?? '').toContain('no-store');
  });

  it('R2 GET /api/projects/counts?q=: 401, the counts of a match, and 400 for a too long q', async () => {
    const all: Response[] = [];
    state.store = new Map();
    const a = await call('/counts', '?q=bath');
    all.push(a.res);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(viewer);
    const b = await call('/counts', '?q=bath');
    all.push(b.res);
    expect(b.res.status).toBe(200);
    expect(b.json).toEqual({
      all: 3,
      draft: 1,
      client_review: 1,
      permit_submitted: 0,
      approved: 1,
      in_build: 0,
    });

    state.store = new Map(viewer);
    const c = await call('/counts', `?q=${'a'.repeat(1001)}`);
    all.push(c.res);
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(INVALID);

    for (const r of all) expect(r.headers.get('cache-control') ?? '').toContain('no-store');
  });
});
