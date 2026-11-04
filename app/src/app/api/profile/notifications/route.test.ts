// EZD-140 T7 (vault/plans/EZD-140.md section 3 routes, D7, section 4; AC-EZD-140-1, -4). next/headers is mocked
// and members sign in as in app/src/app/api/settings/customers/route.test.ts. Expected values: D7 (401, 400,
// 200 bodies, Cache-Control no-store on every response), Q-0393 (no row = both on), the EZD-007c 401 body.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
import { NOTIFICATION_KINDS } from '../../../../lib/notifications/kinds';

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

type Setting = { kind: string; inApp: boolean; email: boolean };
const allOn = (): Setting[] =>
  NOTIFICATION_KINDS.map((kind) => ({ kind, inApp: true, email: true }));

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
    new Request('http://localhost/api/profile/notifications', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  return { res, json: await parse(res) };
}

describe('EZD-140 notification settings routes', () => {
  let tenant = '';
  let a: Member;
  let b: Member;
  let aCookies: Map<string, string>;
  let bCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
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

  it('EZD-140 T7 GET and PUT /api/profile/notifications: 401, defaults, both 400s, a save, the re-read, and no leak to another member', async () => {
    const noStore = (r: Response) =>
      expect(r.headers.get('cache-control') ?? '').toContain('no-store');

    state.store = new Map();
    const unauthenticated = await get();
    expect(unauthenticated.res.status).toBe(401);
    expect(unauthenticated.json).toEqual(NOT_SIGNED_IN);
    noStore(unauthenticated.res);

    state.store = new Map(aCookies);
    const defaults = await get();
    expect(defaults.res.status).toBe(200);
    expect(defaults.json).toEqual({ settings: allOn() });
    noStore(defaults.res);

    state.store = new Map(aCookies);
    const notJson = await put('{not json');
    expect(notJson.res.status).toBe(400);
    expect(notJson.json).toEqual(INVALID);
    noStore(notJson.res);

    state.store = new Map(aCookies);
    const eight = await put(JSON.stringify({ settings: allOn().slice(0, 8) }));
    expect(eight.res.status).toBe(400);
    expect(eight.json).toEqual(INVALID);
    noStore(eight.res);

    const changed = allOn().map((s) => (s.kind === 'edit_request' ? { ...s, inApp: false } : s));
    state.store = new Map(aCookies);
    const saved = await put(JSON.stringify({ settings: changed }));
    expect(saved.res.status).toBe(200);
    expect(saved.json).toEqual({ settings: changed });
    noStore(saved.res);

    state.store = new Map(aCookies);
    const again = await get();
    expect(again.res.status).toBe(200);
    expect(again.json).toEqual({ settings: changed });
    noStore(again.res);

    state.store = new Map(bCookies);
    const other = await get();
    expect(other.res.status).toBe(200);
    expect(other.json).toEqual({ settings: allOn() });
    noStore(other.res);

    const rows = await harnessSql()`
      select user_id from public.notification_setting where tenant_id = ${tenant}::uuid`;
    expect(rows).toHaveLength(9);
    expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([a.appUserId]));
  }, 120000);
});
