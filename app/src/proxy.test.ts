// EZD-007d T11, T37 (vault/plans/EZD-007d.md sections 3 and 4; parent P-T11, P-Step 4; Q-0173): the
// request gate. createSessionClient is mocked (vi.mock of app/src/server/auth/supabase-server.ts); the mock
// receives the jar the proxy passes, so a case can write cookies through it as a token refresh would.
// SESSION_COOKIE_OPTIONS is the real export (EZD-007c, Q-0048 (a)). No database, no network.
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uncoveredWriteRoutes, writeRoutes } from '../test-harness/same-origin/write-routes';
import { CROSS_ORIGIN_REFUSED, SAME_ORIGIN_EXCEPTIONS } from './server/auth/same-origin';
import {
  createSessionClient,
  SESSION_COOKIE_OPTIONS,
  type SessionCookieJar,
} from './server/auth/supabase-server';
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
    // EZD-346 E1 (Decided "Matcher"): the matcher gains the /api entry.
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|.*\\..*).*)', '/api/:path*']);
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
    // EZD-342 P3 (Decided "Old plain session cookies on https"): on https the plain sb- cookies get the stale
    // delete; the plain marker itself is still ignored.
    const res = await withProto(MARKED);
    expectPassThrough(res);
    expect(getClaims).toHaveBeenCalledTimes(1);
    for (const name of ['ezd_signed_out', '__Host-ezd_signed_out']) {
      const c = setCookie(res, name);
      expect(c === undefined || !c.includes('Max-Age=0'), name).toBe(true);
    }
    for (const name of ['sb-x-auth-token', 'sb-x-auth-token.0']) {
      const c = setCookie(res, name);
      expect(c, name).toBeDefined();
      expect(c, name).toMatch(/^[^=]+=;/);
      expect(c, name).toContain('Max-Age=0');
      expect(c, name).toContain('Path=/');
      expect(c, name).toContain('Secure');
    }
    const forwarded = res.headers.get('x-middleware-request-cookie') ?? '';
    expect(forwarded).toContain('sb-x-auth-token=a');
    expect(forwarded).toContain('sb-x-auth-token.0=b');
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

// EZD-342 P1, P2, P3 (vault/plans/EZD-342.md section 4; AC-EZD-342-1, 2, 3, 4; Q-0600; Q-0599): the request
// gate's cookie names. A marked https request deletes both name forms of the session cookie; the gate's jar
// answers isHttps with the one shared x-forwarded-proto test; an unmarked https request deletes old plain
// session cookies.
describe('EZD-342 request gate cookie names', () => {
  afterEach(() => {
    h.make = null;
  });

  const httpsCall = (path: string, cookies: string) =>
    proxy(
      new NextRequest(`http://localhost:3000${path}`, {
        headers: { cookie: cookies, 'x-forwarded-proto': 'https' },
      }),
    );
  const MARKED =
    '__Host-ezd_signed_out=1; __Host-sb-x-auth-token=a; __Host-sb-x-auth-token.0=b; sb-x-auth-token=c; keep=me';
  const DELETED = [
    '__Host-sb-x-auth-token',
    '__Host-sb-x-auth-token.0',
    'sb-x-auth-token',
    '__Host-ezd_signed_out',
  ];

  it('P1 a marked request on https deletes both name forms', async () => {
    const getClaims = vi.fn(async () => WITH_SUB);
    clientWith(getClaims);

    const home = await httpsCall('/', MARKED);
    expectSignInRedirect(home);
    for (const name of DELETED) {
      const c = setCookie(home, name);
      expect(c, name).toBeDefined();
      expect(c, name).toMatch(/^[^=]+=;/);
      expect(c, name).toContain('Max-Age=0');
      expect(c, name).toContain('Path=/');
      expect(c, name).toContain('Secure');
      expect(c, name).not.toContain('Domain');
    }
    expect(setCookie(home, 'keep')).toBeUndefined();

    const signIn = await httpsCall('/sign-in', MARKED);
    expectPassThrough(signIn);
    expect(signIn.headers.get('x-middleware-request-cookie') ?? '').not.toContain('sb-');

    expect(getClaims).not.toHaveBeenCalled();
  });

  it('P2 the gate jar uses the shared https test', async () => {
    const seen = new Array<boolean>();
    clientWith(async (jar) => {
      seen.push(await jar.isHttps());
      return WITH_SUB;
    });
    for (const proto of ['https', 'http, https', undefined]) {
      const headers: Record<string, string> =
        proto === undefined ? {} : { 'x-forwarded-proto': proto };
      await proxy(new NextRequest('http://localhost:3000/', { headers }));
    }
    expect(seen).toEqual([true, false, false]);
  });

  // P3 (Decided "Old plain session cookies on https"; security-reviewer round 1 finding 1; proxy.ts delete
  // options and no-store on any Set-Cookie; AC-EZD-342-3: on http the plain names are live and kept).
  it('P3 an unmarked request on https deletes old plain session cookies', async () => {
    const PLAIN = 'sb-x-auth-token=a; sb-x-auth-token.0=b; __Host-sb-x-auth-token=c; keep=me';
    const STALE = ['sb-x-auth-token', 'sb-x-auth-token.0'];
    const expectStaleDeleted = (res: Response) => {
      for (const name of STALE) {
        const c = setCookie(res, name);
        expect(c, name).toBeDefined();
        expect(c, name).toMatch(/^[^=]+=;/);
        expect(c, name).toContain('Max-Age=0');
        expect(c, name).toContain('Path=/');
        expect(c, name).toContain('Secure');
        expect(c, name).not.toContain('Domain');
      }
      expect(setCookie(res, '__Host-sb-x-auth-token')).toBeUndefined();
      expect(setCookie(res, 'keep')).toBeUndefined();
    };

    // (a) signed in, https
    clientWith(async () => WITH_SUB);
    const a = await httpsCall('/', PLAIN);
    expectPassThrough(a);
    expectStaleDeleted(a);
    expect(a.headers.get('cache-control')).toBe('private, no-store');

    // (b) signed out, https
    clientWith(async () => NO_CLAIMS);
    const b = await httpsCall('/', PLAIN);
    expectSignInRedirect(b);
    expectStaleDeleted(b);

    // (c) the same cookies on http: nothing deleted
    clientWith(async () => WITH_SUB);
    const c = await proxy(
      new NextRequest('http://localhost:3000/', { headers: { cookie: PLAIN } }),
    );
    expectPassThrough(c);
    expect(c.headers.getSetCookie()).toEqual([]);

    // (d) https with no plain session cookie: no delete, no no-store
    clientWith(async () => WITH_SUB);
    const d = await httpsCall('/', '__Host-sb-x-auth-token=c; keep=me');
    expect(d.headers.getSetCookie()).toEqual([]);
    expect(d.headers.get('cache-control')).toBeNull();
  });
});

// EZD-346 S1-S13, W1-W3 (vault/plans/EZD-346.md section 4; AC-EZD-346-1 to -4; Q-0599): every /api write is
// same-origin or refused first. The own origin is http://localhost:3000 (the NextRequest url below).
const ID0 = '00000000-0000-4000-8000-000000000000';
const CK = `/api/projects/${ID0}/checkpoints`;
const OB = `/api/projects/${ID0}/objects`;
const RA = '/api/notifications/read-all';
const CROSS = { 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' };
const SIBLING = { 'sec-fetch-site': 'same-site', origin: 'https://other.ezcontractorbinder.com' };

const callAs = (p: string, method: string, headers?: HeadersInit) =>
  proxy(new NextRequest(`http://localhost:3000${p}`, { method, headers }));

async function expectRefused(res: Response, label: string) {
  expect(res.status, label).toBe(403);
  expect(await res.json(), label).toEqual(CROSS_ORIGIN_REFUSED);
  expect(res.headers.get('cache-control'), label).toContain('no-store');
  expect(res.headers.get('set-cookie'), label).toBeNull();
  expect(res.headers.get('location'), label).toBeNull();
}

// A refusal must not build the session client.
async function refusedCall(p: string, method: string, headers?: HeadersInit, label = p) {
  clientWith(async () => WITH_SUB);
  vi.mocked(createSessionClient).mockClear();
  const res = await callAs(p, method, headers);
  await expectRefused(res, label);
  expect(createSessionClient, label).not.toHaveBeenCalled();
}

async function passingCall(p: string, method: string, headers?: HeadersInit, label = p) {
  clientWith(async () => WITH_SUB);
  const res = await callAs(p, method, headers);
  expect(res.status, label).not.toBe(403);
  expectPassThrough(res);
}

async function loadMatcher() {
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
  const { unstable_doesMiddlewareMatch } = await import('next/experimental/testing/server');
  return (url: string) => unstable_doesMiddlewareMatch({ config, url });
}

describe('EZD-346 same-origin writes', () => {
  afterEach(() => {
    h.make = null;
  });

  it('S1 cross-site POST refused', async () => {
    for (const p of [CK, OB, RA]) await refusedCall(p, 'POST', CROSS, `POST ${p}`);
  });

  it('S2 sibling-subdomain POST refused', async () => {
    for (const p of [CK, OB, RA]) await refusedCall(p, 'POST', SIBLING, `POST ${p}`);
  });

  it('S3 same-origin header passes', async () => {
    const same = { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:3000' };
    for (const p of [CK, OB, RA]) await passingCall(p, 'POST', same, `POST ${p}`);
    await passingCall(RA, 'POST', { 'sec-fetch-site': 'same-origin' }, 'POST RA header only');
  });

  it('S4 Origin fallback passes', async () => {
    for (const p of [CK, OB, RA]) {
      await passingCall(p, 'POST', { origin: 'http://localhost:3000' }, `POST ${p}`);
    }
  });

  it('S5 Origin fallback refusals', async () => {
    const cases: Array<Record<string, string>> = [
      {},
      { origin: 'null' },
      { origin: 'https://localhost:3000' },
      { origin: 'http://localhost:3001' },
      { origin: 'http://localhost:3000/' },
      { origin: 'https://ezdraft.ezcontractorbinder.com' },
    ];
    for (const headers of cases) await refusedCall(RA, 'POST', headers, JSON.stringify(headers));
  });

  it('S6 Sec-Fetch-Site forms refused', async () => {
    for (const site of ['none', 'Same-Origin', '', 'same-site']) {
      await refusedCall(
        RA,
        'POST',
        { 'sec-fetch-site': site, origin: 'http://localhost:3000' },
        `sec-fetch-site "${site}"`,
      );
    }
    const twice = new Headers();
    twice.append('sec-fetch-site', 'same-origin');
    twice.append('sec-fetch-site', 'cross-site');
    await refusedCall(RA, 'POST', twice, 'sec-fetch-site appended twice');
  });

  it('S7 every write method refused', async () => {
    for (const m of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'PURGE']) {
      await refusedCall(RA, m, CROSS, m);
    }
  });

  it('S8 GET and HEAD unchanged', async () => {
    for (const m of ['GET', 'HEAD']) {
      for (const p of [RA, '/api/projects']) {
        clientWith(async () => WITH_SUB);
        vi.mocked(createSessionClient).mockClear();
        const res = await callAs(p, m, CROSS);
        expect(res.status, `${m} ${p}`).not.toBe(403);
        expectPassThrough(res);
        expect(createSessionClient, `${m} ${p}`).toHaveBeenCalledTimes(1);
      }
    }
  });

  it('S9 exceptions list', async () => {
    await passingCall('/api/monitoring', 'POST', undefined, 'monitoring no headers');
    await passingCall('/api/monitoring', 'POST', CROSS, 'monitoring cross');
    await refusedCall('/api/monitoring/', 'POST', undefined, '/api/monitoring/');
    await refusedCall('/api/monitoring/x', 'POST', undefined, '/api/monitoring/x');
  });

  it('S10 path class', async () => {
    for (const p of [
      '/API/notifications/read-all',
      '/%61pi/notifications/read-all',
      '//api/notifications/read-all',
      '/api%2Fnotifications/read-all',
      '/%E0%A4%A',
    ]) {
      await refusedCall(p, 'POST', undefined, p);
    }
    await passingCall('/apix', 'POST', CROSS, '/apix');
    await passingCall('/projects', 'POST', CROSS, '/projects');
  });

  it('S11 matcher', async () => {
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image|.*\\..*).*)', '/api/:path*']);
    const matches = await loadMatcher();
    expect(matches('http://localhost:3000/api/projects/a.b/checkpoints')).toBe(true);
    expect(matches('http://localhost:3000/api/x.json')).toBe(true);
    expect(matches('http://localhost:3000/icons/sprite.svg')).toBe(false);
    expect(matches('http://localhost:3000/sw.js')).toBe(false);
  });

  it('S12 refusal before the marker', async () => {
    await refusedCall(RA, 'POST', { ...CROSS, cookie: 'ezd_signed_out=1' }, 'marked cross-site');
  });

  it('S13 exceptions list is exact', () => {
    expect(SAME_ORIGIN_EXCEPTIONS).toEqual([
      {
        path: '/api/monitoring',
        reason:
          'Error-report tunnel (EZD-024 Step 7): public, reads no session; scripts/errors/live-check.mjs posts to it from outside a browser.',
      },
    ]);
  });
});

describe('EZD-346 every write route is checked', () => {
  afterEach(() => {
    h.make = null;
  });

  const appSrc = path.dirname(fileURLToPath(import.meta.url));
  const exceptionPaths = () => SAME_ORIGIN_EXCEPTIONS.map((e) => e.path);

  it('W1 every write route is covered', async () => {
    clientWith(async () => WITH_SUB);
    const routes = writeRoutes(appSrc);
    expect(
      await uncoveredWriteRoutes(routes, proxy, await loadMatcher(), exceptionPaths()),
    ).toEqual([]);
    for (const [method, url] of [
      ['POST', CK],
      ['POST', OB],
      ['POST', RA],
      ['POST', '/api/monitoring'],
    ]) {
      expect(routes, `${method} ${url}`).toEqual(
        expect.arrayContaining([expect.objectContaining({ method, url })]),
      );
    }
  });

  it('W2 the walk fails on unchecked writes', async () => {
    const routes = writeRoutes(appSrc);
    const out = await uncoveredWriteRoutes(
      routes,
      async () => NextResponse.next(),
      await loadMatcher(),
      exceptionPaths(),
    );
    expect(out).toEqual(
      routes.filter((r) => r.url !== '/api/monitoring').map((r) => `${r.method} ${r.file}`),
    );
    expect(out.length).toBeGreaterThanOrEqual(18);
  });

  it('W3 no stale exception', () => {
    const urls = writeRoutes(appSrc).map((r) => r.url);
    for (const e of SAME_ORIGIN_EXCEPTIONS) {
      expect(urls, e.path).toContain(e.path);
      expect(e.reason.trim().length, e.path).toBeGreaterThan(0);
    }
  });
});
