// EZD-018 T17 (vault/plans/EZD-018.md Tests; Step 4): the Realtime token route. next/headers is mocked the
// way app/src/server/auth/session.test.ts does (cookies() over an in-memory store, headers() empty); a
// fresh member signs in with admin generateLink + createSessionClient(jar).auth.verifyOtp (no email sent).
// Expected values: Step 4; the requireApiSession 401 body (app/src/server/auth/session.ts, EZD-007c);
// the 500 body of Q-0168 (b) and app/src/app/api/health/route.ts. Secrets are compared only as booleans
// (L-018): the gate secret never appears in a body, the apiKey is not the secret key (Q-0087).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { secretKeyValue } from '../../../../../test-harness/secret-key-value';
import {
  adminDb,
  claimsOf,
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

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));

// EZD-169 (vault/plans/EZD-169.md E1): the 500 catch now reports through reportRouteFailure. T17 (d) reaches
// that catch with a working alert store; the mock keeps it from writing an error_alert row or sending an
// owner email outside the error-alert lock (architecture EZD-024; app/test-harness/errors/alert-lock.ts).
vi.mock('../../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));

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

const NOT_SIGNED_IN_BODY = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const DB_UNAVAILABLE_BODY = {
  error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
};

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
  expect(store.size).toBeGreaterThan(0);
  return store;
}

const gateSecret = () => process.env.SUPABASE_API_GATE_SECRET ?? '';

async function call(): Promise<{ res: Response; text: string }> {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, text: await res.text() };
}

describe('EZD-018 realtime token route', () => {
  let t: Member;
  let tCookies: Map<string, string>;

  beforeAll(async () => {
    const tenantId = await createTenant();
    t = await createMember({ tenantId, scope: 'all' });
    tCookies = await cookiesFor(t.email);
  });

  afterEach(() => {
    state.store = new Map();
    vi.doUnmock('../../../../server/auth/session');
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-018 T17 token route: 401 signed out, 200 signed in, 401 after deactivation, 500 on a database failure', async () => {
    // The gate secret is set by the Vitest global setup; a blank one would make the "not contained" checks empty.
    expect(gateSecret().length >= 43).toBe(true);

    // (a) no session.
    state.store = new Map();
    const a = await call();
    expect(a.res.status).toBe(401);
    expect(JSON.parse(a.text)).toEqual(NOT_SIGNED_IN_BODY);
    expect(a.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(a.text.includes(gateSecret())).toBe(false);

    // (b) signed in as t.
    state.store = new Map(tCookies);
    const b = await call();
    expect(b.res.status).toBe(200);
    expect(b.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(b.text.includes(gateSecret())).toBe(false);
    const body = JSON.parse(b.text) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'accessToken',
      'apiKey',
      'appUserId',
      'expiresAt',
      'url',
    ]);
    expect(body.apiKey).toBe(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(body.apiKey === secretKeyValue()).toBe(false);
    expect(body.url).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL);
    expect(body.appUserId).toBe(t.appUserId);
    const claims = claimsOf(String(body.accessToken));
    expect(claims.sub).toBe(t.authUserId);
    expect(body.expiresAt).toBe(claims.exp);

    // (c) t deactivated (EZD-006 ends the sessions); same cookies.
    await harnessSql()`
      update public.membership set status = 'deactivated' where id = ${t.membershipId}::uuid`;
    state.store = new Map(tCookies);
    vi.resetModules();
    const c = await call();
    expect(c.res.status).toBe(401);
    expect(JSON.parse(c.text)).toEqual(NOT_SIGNED_IN_BODY);
    expect(c.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(c.text.includes(gateSecret())).toBe(false);

    // (d) requireApiSession rejects (the current_app_user_id call failed, Q-0168 (b)).
    vi.resetModules();
    vi.doMock('../../../../server/auth/session', () => ({
      requireApiSession: () => Promise.reject(new Error('rpc down')),
      getSession: () => Promise.reject(new Error('rpc down')),
      requireSession: () => Promise.reject(new Error('rpc down')),
    }));
    const d = await call();
    expect(d.res.status).toBe(500);
    expect(JSON.parse(d.text)).toEqual(DB_UNAVAILABLE_BODY);
    expect(d.text.includes('rpc down')).toBe(false);
    expect(d.res.headers.get('cache-control') ?? '').toContain('no-store');
  });
});
