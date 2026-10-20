// EZD-007d T11, T37 (vault/plans/EZD-007d.md sections 3 and 4; parent P-T11, P-Step 4; Q-0173): the
// request gate. createSessionClient is mocked (vi.mock of app/src/server/auth/supabase-server.ts); the mock
// receives the jar the proxy passes, so a case can write cookies through it as a token refresh would.
// SESSION_COOKIE_OPTIONS is the real export (EZD-007c, Q-0048 (a)). No database, no network.
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_OPTIONS, type SessionCookieJar } from './server/auth/supabase-server';
import { config, proxy } from './proxy';

type Claims = { data: { claims: Record<string, unknown> } | null; error: unknown };

const h = vi.hoisted(() => ({
  make: null as null | ((jar: SessionCookieJar) => unknown),
}));

vi.mock('./server/auth/supabase-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./server/auth/supabase-server')>();
  return {
    ...actual,
    createSessionClient: vi.fn((jar: SessionCookieJar) => {
      if (!h.make) throw new Error('test did not set a client');
      return h.make(jar);
    }),
  };
});

const NO_CLAIMS: Claims = { data: null, error: null };
const WITH_SUB: Claims = { data: { claims: { sub: 'user-1' } }, error: null };

function clientWith(getClaims: (jar: SessionCookieJar) => Promise<Claims>) {
  h.make = (jar) => ({ auth: { getClaims: () => getClaims(jar) } });
}

function throwingClient() {
  h.make = () => {
    throw new Error('api_gate_secret_not_set');
  };
}

const refreshWrite = () =>
  clientWith(async (jar) => {
    await jar.set('sb-test-auth-token', 'new', SESSION_COOKIE_OPTIONS);
    return WITH_SUB;
  });

const clearingWrite = () =>
  clientWith(async (jar) => {
    await jar.set('sb-test-auth-token', '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    return { data: null, error: new Error('refresh failed') };
  });

const call = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));

function expectSignInRedirect(res: Response) {
  expect(res.status).toBe(307);
  const location = new URL(res.headers.get('location') ?? '');
  expect(location.pathname).toBe('/sign-in');
  expect(location.search).toBe('');
}

function expectPassThrough(res: Response) {
  expect(res.status).not.toBe(307);
  expect(res.headers.get('location')).toBeNull();
  expect(res.headers.get('x-middleware-next')).toBe('1');
}

const setCookie = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

describe('EZD-007d request gate', () => {
  afterEach(() => {
    h.make = null;
  });

  it('EZD-007d done when: a page request without a session is redirected to /sign-in @smoke', async () => {
    // (a) no session on /
    clientWith(async () => NO_CLAIMS);
    expectSignInRedirect(await call('/'));

    // (b) session on /
    clientWith(async () => WITH_SUB);
    expectPassThrough(await call('/'));

    // (c) /sign-in, (d) /api/health with no session
    clientWith(async () => NO_CLAIMS);
    expectPassThrough(await call('/sign-in'));
    clientWith(async () => NO_CLAIMS);
    expectPassThrough(await call('/api/health'));

    // (e) client cannot be built: redirect, never 500
    throwingClient();
    const e = await call('/');
    expect(e.status).not.toBe(500);
    expectSignInRedirect(e);

    // (f) refresh writes the cookie through the jar
    refreshWrite();
    const f = await call('/');
    expectPassThrough(f);
    expect(
      (f as unknown as { cookies: { get(n: string): { value: string } | undefined } }).cookies.get(
        'sb-test-auth-token',
      )?.value,
    ).toBe('new');
    const fCookie = setCookie(f, 'sb-test-auth-token') ?? '';
    expect(fCookie).toContain('HttpOnly');
    expect(fCookie).toContain('Max-Age=34560000');

    // (g) /sign-in when the client cannot be built
    throwingClient();
    expectPassThrough(await call('/sign-in'));

    // (h) refresh clears the cookie and fails
    clearingWrite();
    const hRes = await call('/projects');
    expectSignInRedirect(hRes);
    expect(setCookie(hRes, 'sb-test-auth-token') ?? '').toContain('Max-Age=0');

    // (i) matcher
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|.*\\..*).*)']);
  });

  it('EZD-007d T37 written cookies: no cache, seen by the render', async () => {
    // (a) T11 (f)
    refreshWrite();
    const a = await call('/');
    expect(a.headers.get('cache-control')).toBe('private, no-store');
    expect(a.headers.get('x-middleware-set-cookie') ?? '').toContain('sb-test-auth-token=new');

    // (b) /sign-in with the same write and claims
    refreshWrite();
    const b = await call('/sign-in');
    expect(b.headers.get('cache-control')).toBe('private, no-store');

    // (c) T11 (h)
    clearingWrite();
    const c = await call('/projects');
    expect(c.headers.get('cache-control')).toBe('private, no-store');
  });
});
