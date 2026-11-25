// EZD-230 (Q-0038 "each user can set the order of the tools on the rail"; Q-0122). next/headers is mocked and members
// sign in as in ../notifications/route.test.ts. Expected values: the route's order (401, 400, then the save), the
// EZD-007c 401 body, an empty order before any save (the migration's default '{}'), Cache-Control no-store.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  type Member,
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
const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function get(): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, json: await parse(res) };
}
async function put(raw: string): Promise<{ res: Response; json: unknown }> {
  const { PUT } = await import('./route');
  const res = await PUT(
    new Request('http://localhost/api/profile/rail-order', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  return { res, json: await parse(res) };
}

describe('EZD-230 rail order routes', () => {
  let a: Member;
  let b: Member;
  let aCookies: Map<string, string>;
  let bCookies: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    a = await createMember({ tenantId: tenant, scope: 'all' });
    b = await createMember({ tenantId: tenant, scope: 'all' });
    aCookies = await cookiesFor(a.email);
    bCookies = await cookiesFor(b.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('GET and PUT: 401, empty before a save, the 400s, a save and its re-read, and B keeps their own order', async () => {
    const noStore = (r: Response) =>
      expect(r.headers.get('cache-control') ?? '').toContain('no-store');

    state.store = new Map();
    const anon = await get();
    expect(anon.res.status).toBe(401);
    expect(anon.json).toEqual(NOT_SIGNED_IN);
    noStore(anon.res);
    state.store = new Map();
    expect((await put('{"order":[]}')).res.status).toBe(401);

    state.store = new Map(aCookies);
    const first = await get();
    expect(first.res.status).toBe(200);
    expect(first.json).toEqual({ order: [] });
    noStore(first.res);

    for (const body of [
      '{not json',
      '{}',
      '{"order":"wall"}',
      '{"order":["Wall"]}',
      '{"order":["wall","wall"]}',
      '{"order":[3]}',
    ]) {
      state.store = new Map(aCookies);
      const r = await put(body);
      expect(r.res.status, body).toBe(400);
      expect(r.json, body).toEqual(INVALID);
    }
    state.store = new Map(aCookies);
    expect(
      (await put(JSON.stringify({ order: Array.from({ length: 65 }, (_, i) => `t${i}`) }))).res
        .status,
    ).toBe(400);

    state.store = new Map(aCookies);
    const saved = await put(JSON.stringify({ order: ['wall', 'select', 'measure'] }));
    expect(saved.res.status).toBe(200);
    expect(saved.json).toEqual({ order: ['wall', 'select', 'measure'] });
    noStore(saved.res);

    state.store = new Map(aCookies);
    expect((await get()).json).toEqual({ order: ['wall', 'select', 'measure'] });

    state.store = new Map(bCookies);
    expect((await get()).json).toEqual({ order: [] });
  });
});
