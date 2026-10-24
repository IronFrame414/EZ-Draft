// EZD-007c T12, T20, T31, T32, T34, T35 (vault/plans/EZD-007c.md sections 3 and 4): the session client,
// the session helpers and the server-only API gate secret. Uses the EZD-004b/EZD-006 global setup (local
// stack reset by db:up; per-run SUPABASE_API_GATE_SECRET). next/headers is mocked: cookies() resolves to an
// in-memory store, headers() to new Headers() (plan section 4 intro). Members sign in without email:
// admin generateLink + createSessionClient(jar).auth.verifyOtp (the fixtures.ts signIn pattern). No seeded
// row is used or changed. Expected values: plan section 3, Q-0100 (wording), Q-0048 (a) (400 days =
// 34,560,000 s), Q-0052 (c), Q-0087 (ii), Q-0168 (b), scripts/db/api-gate.mjs (43-character secret).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  createUnlinkedAuthUser,
  harnessSql,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { en } from '../messages/catalogs/en';
import { es } from '../messages/catalogs/es';
import { serverGateSecret } from '../db/env';
import { createSessionClient, type SessionCookieJar } from './supabase-server';
import { getSession, requireApiSession, requireSession } from './session';

type CookieOptionsArg = Parameters<SessionCookieJar['set']>[2];
type CookieSet = { name: string; value: string; options: CookieOptionsArg };

// The store next/headers cookies() reads and writes (plan section 4 intro).
const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  sets: [] as { name: string; value: string; options: unknown }[],
  proto: null as string | null,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      state.sets.push({ name, value, options });
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
  }),
  headers: async () => {
    const h = new Headers();
    if (state.proto) h.set('x-forwarded-proto', state.proto);
    return h;
  },
}));

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const NOT_SIGNED_IN_BODY = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };

// A recording jar over a cookie map (plan section 3 SessionCookieJar).
function jarOver(
  store: Map<string, string>,
  https = false,
  record: CookieSet[] = [],
): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      record.push({ name, value, options });
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => https,
  };
}

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// generateLink (no email sent) then verifyOtp through the session client, so the jar receives the cookies.
async function signInThrough(email: string, jar: SessionCookieJar) {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const client = createSessionClient(jar);
  const { error } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await macrotask();
  return client;
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const store = new Map<string, string>();
  await signInThrough(email, jarOver(store));
  expect(store.size).toBeGreaterThan(0);
  return store;
}

function useCookies(cookies: Map<string, string>) {
  state.store = new Map(cookies);
  state.sets = [];
}

// Non-test source files under app/src (test files and shared test helpers excluded; docs/architecture.md Tests).
const appSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const appRoot = path.resolve(appSrc, '..');
const repoRoot = path.resolve(appRoot, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const isTestFile = (file: string) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) ||
  file.split(path.sep).some((part) => part === 'test-harness' || part === 'test-utils');

const rel = (file: string) => path.relative(repoRoot, file).split(path.sep).join('/');

describe('EZD-007c session client and API gate secret', () => {
  let tenantId: string;
  let m: Member;
  let mCookies: Map<string, string>;

  beforeAll(async () => {
    tenantId = await createTenant();
    m = await createMember({ tenantId, scope: 'all' });
    mCookies = await cookiesFor(m.email);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    state.store = new Map();
    state.sets = [];
    state.proto = null;
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-007c done when: requireApiSession answers 401 with error.not_signed_in', async () => {
    // (a) empty cookie store
    useCookies(new Map());
    const res = await requireApiSession();
    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(NOT_SIGNED_IN_BODY);

    // (b) catalogs (Q-0100; Q-0030 (a))
    const enText = (en as Record<string, unknown>)['error.not_signed_in'];
    const esText = (es as Record<string, unknown>)['error.not_signed_in'];
    expect(enText).toBe("You're signed out. Sign in again to continue.");
    expect(typeof esText).toBe('string');
    expect((esText as string).trim().length).toBeGreaterThan(0);
    expect(esText).not.toBe(enText);
  });

  it('EZD-007c done when: createSessionClient sends the API gate header from the server-only SUPABASE_API_GATE_SECRET', async () => {
    // (a) every PostgREST request carries x-ezd-api-gate = the server secret
    const spy = vi.spyOn(globalThis, 'fetch');
    const client = createSessionClient(jarOver(new Map(mCookies)));
    const { data, error } = await client.rpc('current_app_user_id');
    const restPrefix = `${url()}/rest/v1/`;
    const rest = spy.mock.calls
      .map(
        ([input, init]) => new Request(input as RequestInfo | URL, init as RequestInit | undefined),
      )
      .filter((r) => r.url.startsWith(restPrefix));
    expect(rest.length).toBeGreaterThanOrEqual(1);
    for (const r of rest) {
      expect(r.headers.get('x-ezd-api-gate')).toBe(process.env.SUPABASE_API_GATE_SECRET);
    }
    expect(error).toBeNull();
    expect(data).toBe(m.appUserId);
    vi.restoreAllMocks();

    // (b) same cookies, secret unset: getSession resolves null
    useCookies(mCookies);
    vi.stubEnv('SUPABASE_API_GATE_SECRET', undefined);
    await expect(getSession()).resolves.toBeNull();
    vi.unstubAllEnvs();

    // (c) static: the name is server-only and never public
    const sources = walk(appSrc).filter((f) => !isTestFile(f));
    const withSecret = sources.filter((f) =>
      readFileSync(f, 'utf8').includes('SUPABASE_API_GATE_SECRET'),
    );
    for (const f of withSecret) expect(rel(f).startsWith('app/src/server/')).toBe(true);
    const publicName = ['NEXT_PUBLIC', 'SUPABASE_API_GATE'].join('_');
    const withPublic = walk(appSrc).filter((f) => readFileSync(f, 'utf8').includes(publicName));
    expect(withPublic.map(rel)).toEqual([]);
    const envExample = readFileSync(path.join(repoRoot, '.env.example'), 'utf8')
      .split('\n')
      .map((l) => l.trim());
    expect(envExample).toContain('SUPABASE_API_GATE_SECRET=');
  });

  it('EZD-007c done when: getSession returns null with no valid session or no secret', async () => {
    const expected = { authUserId: m.authUserId, appUserId: m.appUserId, email: m.email };

    // (a) signed-in member M
    useCookies(mCookies);
    expect(await getSession()).toEqual(expected);
    useCookies(mCookies);
    expect(await requireSession()).toEqual(expected);
    useCookies(mCookies);
    expect(await requireApiSession()).toEqual(expected);

    // (b) empty store
    useCookies(new Map());
    await expect(getSession()).resolves.toBeNull();
    useCookies(new Map());
    const redirectError = await requireSession().then(
      () => null,
      (e: unknown) => e,
    );
    expect(redirectError).not.toBeNull();
    expect(String((redirectError as { digest?: unknown }).digest)).toContain('/sign-in');

    // (c) secret one character short of the 43-character format
    useCookies(mCookies);
    vi.stubEnv('SUPABASE_API_GATE_SECRET', 'a'.repeat(42));
    await expect(getSession()).resolves.toBeNull();
    vi.unstubAllEnvs();

    // (d) public URL missing
    useCookies(mCookies);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    await expect(getSession()).resolves.toBeNull();
    vi.unstubAllEnvs();

    // (e) auth user with no app_user
    const unlinked = await createUnlinkedAuthUser();
    useCookies(await cookiesFor(unlinked.email));
    await expect(getSession()).resolves.toBeNull();

    // (f) member N deactivated: the EZD-006 trigger ends N's sessions
    const n = await createMember({ tenantId, scope: 'all' });
    const nCookies = await cookiesFor(n.email);
    await harnessSql()`
      update public.membership set status = 'deactivated' where id = ${n.membershipId}::uuid`;
    useCookies(nCookies);
    await expect(getSession()).resolves.toBeNull();
    useCookies(nCookies);
    const ended = await requireApiSession();
    expect(ended).toBeInstanceOf(Response);
    expect((ended as Response).status).toBe(401);
    expect(await (ended as Response).json()).toEqual(NOT_SIGNED_IN_BODY);

    // (g) the current_app_user_id request answers 503: getSession rejects (Q-0168 (b))
    useCookies(mCookies);
    const realFetch = globalThis.fetch;
    const target = `${url()}/rest/v1/rpc/current_app_user_id`;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new Request(input as RequestInfo | URL, init as RequestInit | undefined);
      if (req.url.startsWith(target)) return new Response('', { status: 503 });
      return realFetch(input, init);
    });
    const outcome = await getSession().then(
      (value) => ({ rejected: false as const, value }),
      (reason: unknown) => ({ rejected: true as const, reason }),
    );
    expect(outcome.rejected).toBe(true);
  });

  it('EZD-007c T32 secret reader', () => {
    const throwsNotSet = (fn: () => unknown, mustNotContain?: string) => {
      let caught: unknown;
      try {
        fn();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe('api_gate_secret_not_set');
      if (mustNotContain) expect((caught as Error).message).not.toContain(mustNotContain);
    };

    // (a) unset
    vi.stubEnv('SUPABASE_API_GATE_SECRET', undefined);
    throwsNotSet(() => serverGateSecret());
    // (b) empty
    vi.stubEnv('SUPABASE_API_GATE_SECRET', '');
    throwsNotSet(() => serverGateSecret());
    // (c) 42 characters
    vi.stubEnv('SUPABASE_API_GATE_SECRET', 'a'.repeat(42));
    throwsNotSet(() => serverGateSecret(), 'a'.repeat(42));
    // (d) 43 characters
    vi.stubEnv('SUPABASE_API_GATE_SECRET', 'a'.repeat(43));
    expect(serverGateSecret()).toBe('a'.repeat(43));
    // (e) createSessionClient with the secret unset
    vi.stubEnv('SUPABASE_API_GATE_SECRET', undefined);
    throwsNotSet(() => createSessionClient(jarOver(new Map())));
  });

  it('EZD-007c T34 only allowed files reach Supabase', () => {
    const sources = walk(appSrc).filter((f) => /\.tsx?$/.test(f) && !isTestFile(f));
    const text = new Map(sources.map((f) => [rel(f), readFileSync(f, 'utf8')]));

    const valueUse = [...text]
      .filter(([, body]) =>
        body
          .split('\n')
          .some(
            (line) => line.includes('@supabase/') && !line.trimStart().startsWith('import type '),
          ),
      )
      .map(([file]) => file)
      .sort();
    expect(valueUse).toEqual([
      'app/src/lib/realtime/adapter.ts',
      'app/src/server/auth/supabase-server.ts',
      'app/src/server/db/client.ts',
      'app/src/server/jobs/db.ts',
    ]);

    const ssr = [...text].filter(([, body]) => body.includes('@supabase/ssr')).map(([f]) => f);
    expect(ssr).toEqual(['app/src/server/auth/supabase-server.ts']);

    const publicClientUsers = [...text]
      .filter(
        ([f, body]) => f !== 'app/src/server/db/client.ts' && body.includes('createPublicDbClient'),
      )
      .map(([f]) => f)
      .sort();
    expect(publicClientUsers).toEqual(['app/src/server/db/health.ts']);

    const server = text.get('app/src/server/auth/supabase-server.ts') ?? '';
    expect(server).toContain('API_GATE_HEADER');
    expect(server).toContain('serverGateSecret(');
    expect(server).not.toContain('SUPABASE_SECRET_KEY');
  });

  it('EZD-007c T35 cookie options', async () => {
    const p = await createMember({ tenantId, scope: 'all' });
    const storeA = new Map<string, string>();
    const recA: CookieSet[] = [];
    const clientA = await signInThrough(p.email, jarOver(storeA, false, recA));
    const storeB = new Map<string, string>();
    const recB: CookieSet[] = [];
    await signInThrough(p.email, jarOver(storeB, true, recB));

    for (const [rec, secure] of [
      [recA, false],
      [recB, true],
    ] as const) {
      expect(rec.filter((s) => s.name.startsWith('sb-')).length).toBeGreaterThanOrEqual(1);
      for (const s of rec.filter((r) => r.value !== '')) {
        expect(s.options?.httpOnly).toBe(true);
        expect(s.options?.sameSite).toBe('lax');
        expect(s.options?.path).toBe('/');
        expect(s.options?.maxAge).toBe(34560000);
        expect(s.options?.secure).toBe(secure);
      }
    }

    // (c) local sign-out on the (a) jar clears every sb- cookie it set
    const namesA = [...new Set(recA.filter((s) => s.name.startsWith('sb-')).map((s) => s.name))];
    const mark = recA.length;
    await clientA.auth.signOut({ scope: 'local' });
    await macrotask();
    const after = recA.slice(mark);
    for (const name of namesA) {
      expect(
        after.some((s) => s.name === name && (s.options?.maxAge === 0 || s.value === '')),
        `${name} cleared`,
      ).toBe(true);
    }
  });
});
