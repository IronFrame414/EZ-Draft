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

// EZD-120d U9 (vault/plans/EZD-120d.md section 4; AC-EZD-120d-2; Q-0581): the signed-out marker. A request with
// `ezd_signed_out` is signed out: the proxy deletes every `sb-` cookie and the marker from the request and the
// browser (Max-Age 0), answers a gated page with the 307 to /sign-in, and never asks the auth server.
describe('EZD-120d signed-out marker', () => {
  afterEach(() => {
    h.make = null;
  });

  const withCookies = (path: string, cookies: string) =>
    proxy(new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: cookies } }));
  const MARKED = 'ezd_signed_out=1; sb-x-auth-token=a; sb-x-auth-token.0=b; keep=me';
  const NAMES = ['sb-x-auth-token', 'sb-x-auth-token.0', 'ezd_signed_out'];

  function expectDeleted(res: Response) {
    for (const name of NAMES) {
      const c = setCookie(res, name);
      expect(c, name).toBeDefined();
      expect(c, name).toMatch(/^[^=]+=;/);
      expect(c, name).toContain('Max-Age=0');
      expect(c, name).toContain('Path=/');
    }
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  }

  it('EZD-120d U9 a marked request is signed out: deleted cookies, no auth call', async () => {
    const getClaims = vi.fn(async () => WITH_SUB);
    clientWith(getClaims);

    const home = await withCookies('/', MARKED);
    expectSignInRedirect(home);
    expectDeleted(home);

    const signIn = await withCookies('/sign-in', MARKED);
    expectPassThrough(signIn);
    expectDeleted(signIn);
    const forwarded = signIn.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).not.toContain('sb-');
    expect(forwarded).not.toContain('ezd_signed_out');

    const api = await withCookies('/api/projects/p/objects', MARKED);
    expectPassThrough(api);
    expectDeleted(api);
    expect(api.headers.get('x-middleware-request-cookie') ?? '').not.toContain('sb-');

    expect(getClaims).not.toHaveBeenCalled();
  });

  const withProto = (cookies: string) =>
    proxy(
      new NextRequest('http://localhost:3000/', {
        headers: { cookie: cookies, 'x-forwarded-proto': 'https' },
      }),
    );
  const HOST_MARKED = '__Host-ezd_signed_out=1; sb-x-auth-token=a; sb-x-auth-token.0=b; keep=me';
  const HOST_NAMES = ['sb-x-auth-token', 'sb-x-auth-token.0', '__Host-ezd_signed_out'];

  it('EZD-120d U9 (a) on https the __Host- marker signs out with Secure deletes', async () => {
    const getClaims = vi.fn(async () => WITH_SUB);
    clientWith(getClaims);
    const res = await withProto(HOST_MARKED);
    expectSignInRedirect(res);
    for (const name of HOST_NAMES) {
      const c = setCookie(res, name);
      expect(c, name).toBeDefined();
      expect(c, name).toMatch(/^[^=]+=;/);
      expect(c, name).toContain('Max-Age=0');
      expect(c, name).toContain('Secure');
    }
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(getClaims).not.toHaveBeenCalled();
  });

  it('EZD-120d U9 (a) the forwarded request of an https marked request has no sb- cookie', async () => {
    clientWith(async () => WITH_SUB);
    const res = await proxy(
      new NextRequest('http://localhost:3000/sign-in', {
        headers: { cookie: HOST_MARKED, 'x-forwarded-proto': 'https' },
      }),
    );
    expectPassThrough(res);
    expect(res.headers.get('x-middleware-request-cookie') ?? '').not.toContain('sb-');
  });

  const expectIgnored = (res: Response, getClaims: ReturnType<typeof vi.fn>) => {
    expectPassThrough(res);
    expect(getClaims).toHaveBeenCalledTimes(1);
    for (const name of [...NAMES, ...HOST_NAMES]) {
      const c = setCookie(res, name);
      expect(c === undefined || !c.includes('Max-Age=0'), name).toBe(true);
    }
    const forwarded = res.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).toContain('sb-x-auth-token=a');
    expect(forwarded).toContain('sb-x-auth-token.0=b');
  };

  it('EZD-120d U9 (b) on https a plain ezd_signed_out is ignored', async () => {
    const getClaims = vi.fn(async () => WITH_SUB);
    clientWith(getClaims);
    expectIgnored(await withProto(MARKED), getClaims);
  });

  it('EZD-120d U9 (c) on http a __Host- marker is ignored', async () => {
    const getClaims = vi.fn(async () => WITH_SUB);
    clientWith(getClaims);
    expectIgnored(await withCookies('/', HOST_MARKED), getClaims);
  });

  it('EZD-120d U9 a request without the marker is unchanged', async () => {
    const getClaims = vi.fn(async () => WITH_SUB);
    clientWith(getClaims);
    const res = await withCookies('/', 'sb-x-auth-token=a');
    expectPassThrough(res);
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(setCookie(res, 'sb-x-auth-token')).toBeUndefined();
    expect(setCookie(res, 'ezd_signed_out')).toBeUndefined();
  });
});
