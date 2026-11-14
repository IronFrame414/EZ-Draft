// EZD-395 (vault/plans/EZD-395.md sections 3 and 4): an ended session during a failed token refresh is
// "not signed in" (null / 401 / redirect), not a database error. Runs on the local stack (EZD-004b/EZD-006
// global setup). next/headers is mocked to an in-memory cookie store. Expected values: AC-EZD-395-1/2,
// Q-0052 (c), Q-0168 (b), plan D-Harness (the clock jumps inside the real crypto.subtle.verify).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from './supabase-server';
import { accessTokenEnded, getSession, requireSession } from './session';

type CookieOptionsArg = Parameters<SessionCookieJar['set']>[2];
type CookieSet = { name: string; value: string; options: CookieOptionsArg };

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
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

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const publishableKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

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

function decodeExp(token: string): number {
  const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp;
  if (typeof exp !== 'number') throw new Error('token has no numeric exp');
  return exp;
}

type WindowCounts = {
  refreshPosts: number;
  verifyCalls: number;
  rpcAuthorization: (string | null)[];
  alertCalls: number;
};

describe('EZD-395 ended session during a failed refresh', () => {
  let tenantId: string;
  let m: Member;
  let mCookies: Map<string, string>;
  let exp: number;

  function armWindow(jumpTo: number, rpc: 'pass' | 'status503'): WindowCounts {
    const counts: WindowCounts = {
      refreshPosts: 0,
      verifyCalls: 0,
      rpcAuthorization: [],
      alertCalls: 0,
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(exp * 1000 - 30_000);
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new Request(input as RequestInfo | URL, init as RequestInit | undefined);
      if (
        req.method === 'POST' &&
        req.url.startsWith(`${url()}/auth/v1/token?grant_type=refresh_token`)
      ) {
        counts.refreshPosts += 1;
        return new Response(
          JSON.stringify({
            code: 400,
            error_code: 'refresh_token_not_found',
            msg: 'Invalid Refresh Token: Refresh Token Not Found',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      if (req.url.startsWith(`${url()}/rest/v1/rpc/current_app_user_id`)) {
        counts.rpcAuthorization.push(req.headers.get('authorization'));
        if (rpc === 'status503') return new Response('', { status: 503 });
      }
      if (req.url.startsWith(`${url()}/rest/v1/rpc/record_error_alert`)) {
        counts.alertCalls += 1;
        return new Response('', { status: 503 });
      }
      return realFetch(input, init);
    });
    const subtle = globalThis.crypto.subtle;
    const realVerify = subtle.verify.bind(subtle);
    vi.spyOn(subtle, 'verify').mockImplementation(
      async (...args: Parameters<SubtleCrypto['verify']>) => {
        const ok = await realVerify(...args);
        counts.verifyCalls += 1;
        vi.setSystemTime(jumpTo);
        return ok;
      },
    );
    state.store = new Map(mCookies);
    return counts;
  }

  beforeAll(async () => {
    tenantId = await createTenant();
    m = await createMember({ tenantId, scope: 'all' });
    const store = new Map<string, string>();
    const client = await signInThrough(m.email, jarOver(store));
    mCookies = store;
    const { data } = await client.auth.getSession();
    exp = decodeExp(data.session!.access_token);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    state.store = new Map();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-395 T1 the token ends between getClaims and the user lookup: getSession returns null', async () => {
    const counts = armWindow(exp * 1000, 'pass');
    await expect(getSession()).resolves.toBeNull();
    expect(counts.verifyCalls).toBe(1);
    expect(counts.rpcAuthorization).toEqual([`Bearer ${publishableKey()}`]);
    expect(counts.refreshPosts).toBe(1);
  });

  it('EZD-395 T2 one millisecond before the end the session is kept', async () => {
    const counts = armWindow(exp * 1000 - 1, 'pass');
    await expect(getSession()).resolves.toEqual({
      authUserId: m.authUserId,
      appUserId: m.appUserId,
      email: m.email,
    });
    expect(counts.rpcAuthorization).toHaveLength(1);
    expect(counts.rpcAuthorization[0]?.startsWith('Bearer ')).toBe(true);
    expect(counts.rpcAuthorization[0]).not.toBe(`Bearer ${publishableKey()}`);
    expect(counts.verifyCalls).toBe(1);
    expect(counts.refreshPosts).toBe(1);
  });

  it('EZD-395 T3 a 42501 for an unexpired token still rejects', async () => {
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new Request(input as RequestInfo | URL, init as RequestInit | undefined);
      if (req.url.startsWith(`${url()}/rest/v1/rpc/current_app_user_id`)) {
        return new Response(
          JSON.stringify({
            code: '42501',
            details: null,
            hint: null,
            message: 'permission denied for function current_app_user_id',
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input, init);
    });
    state.store = new Map(mCookies);
    const outcome = await getSession().then(
      (value) => ({ rejected: false as const, value }),
      (reason: unknown) => ({ rejected: true as const, reason }),
    );
    expect(outcome.rejected).toBe(true);
    expect((outcome as { reason: { code?: unknown } }).reason?.code).toBe('42501');
  });

  it('EZD-395 T4 a 503 after the end still rejects', async () => {
    const counts = armWindow(exp * 1000, 'status503');
    const outcome = await getSession().then(
      (value) => ({ rejected: false as const, value }),
      (reason: unknown) => ({ rejected: true as const, reason }),
    );
    expect(outcome.rejected).toBe(true);
    expect(counts.rpcAuthorization).toEqual([`Bearer ${publishableKey()}`]);
    expect(counts.verifyCalls).toBe(1);
  });

  it('EZD-395 T5 the route answers 401 no-store and writes no error alert', async () => {
    const counts = armWindow(exp * 1000, 'pass');
    const { GET } = await import('../../app/api/permissions/route');
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'not_signed_in', message_key: 'error.not_signed_in' },
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(counts.alertCalls).toBe(0);
    expect(counts.rpcAuthorization).toEqual([`Bearer ${publishableKey()}`]);
  });

  it('EZD-395 T6 a page redirects to the sign-in screen', async () => {
    const counts = armWindow(exp * 1000, 'pass');
    const e = await requireSession().then(
      () => null,
      (x: unknown) => x,
    );
    expect(String((e as { digest?: unknown }).digest)).toContain('/sign-in');
    expect(counts.rpcAuthorization).toEqual([`Bearer ${publishableKey()}`]);
  });

  it('EZD-395 T7 accessTokenEnded boundary and malformed values', () => {
    expect(accessTokenEnded(1000, 1_000_000)).toBe(true);
    expect(accessTokenEnded(1000, 999_999)).toBe(false);
    expect(accessTokenEnded(1000, 1_000_001)).toBe(true);
    expect(accessTokenEnded('1000', 2_000_000)).toBe(false);
    expect(accessTokenEnded(undefined, 2_000_000)).toBe(false);
    expect(accessTokenEnded(Number.NaN, 2_000_000)).toBe(false);
    expect(accessTokenEnded(Number.NEGATIVE_INFINITY, 2_000_000)).toBe(false);
  });
});
