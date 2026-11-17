// EZD-421 (Q-0753 (a); Q-0052 (c); AC-EZD-421-1, AC-EZD-421-2): the shared ended-session rule. A route call
// that fails after the session read answers 401 not_signed_in with Cache-Control: no-store and no report when
// the session has ended (a failed refresh after the token's exp, or the session ended in the database); a live
// session keeps the route's 500 path (null here), and so does a confirm step that throws (fail closed).
// Runs on the local stack (EZD-004b/EZD-006 global setup); next/headers is mocked to an in-memory cookie store.
// Expected bodies: requireApiSession (session.ts, EZD-349); Q-0052 (c) for what counts as ended.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from './supabase-server';
import { endedSessionResponse, sessionEnded, sessionLossForm } from './ended-session';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  throwOnCreate: false,
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

vi.mock('./supabase-server', async (importOriginal) => {
  const real = await importOriginal<typeof import('./supabase-server')>();
  return {
    ...real,
    createSessionClient: (...args: Parameters<typeof real.createSessionClient>) => {
      if (state.throwOnCreate) throw new Error('confirm step failed');
      return real.createSessionClient(...args);
    },
  };
});

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const DENIED = { code: '42501', details: null, hint: null, message: 'permission denied for table project' };

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

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function signInCookies(email: string): Promise<{ cookies: Map<string, string>; exp: number }> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const cookies = new Map<string, string>();
  const client = createSessionClient(jarOver(cookies));
  const { error } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await macrotask();
  const { data } = await client.auth.getSession();
  const token = data.session!.access_token;
  const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp;
  return { cookies, exp: exp as number };
}

// After the token's exp with a refresh Auth refuses (the EZD-395 window): the refresh POST answers 400
// refresh_token_not_found, or `refresh` as given.
function pastExpiry(exp: number, refresh: 'refused' | 'status500' = 'refused') {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(exp * 1000 + 1000);
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input as RequestInfo | URL, init as RequestInit | undefined);
    if (req.method === 'POST' && req.url.startsWith(`${url()}/auth/v1/token?grant_type=refresh_token`)) {
      if (refresh === 'status500') {
        // Auth retries a 5xx while the frozen clock allows; moving it a minute ends the retries.
        vi.setSystemTime(Date.now() + 60_000);
        return new Response(JSON.stringify({ code: 500, error_code: 'unexpected_failure', msg: 'x' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    return realFetch(input, init);
  });
}

describe('EZD-421 session-loss error forms', () => {
  it('T1 a denied privilege, a rejected JWT and an Auth session error are session-loss forms', () => {
    expect(sessionLossForm(DENIED)).toBe(true);
    expect(sessionLossForm({ code: 'PGRST301' })).toBe(true);
    expect(sessionLossForm({ code: 'PGRST303' })).toBe(true);
    expect(sessionLossForm({ name: 'AuthApiError', status: 403, code: 'session_not_found' })).toBe(true);
    expect(sessionLossForm({ name: 'AuthSessionMissingError' })).toBe(true);
    expect(sessionLossForm(new Error('get_my_ai_key_failed', { cause: DENIED }))).toBe(true);
  });

  it('T2 other failures are not', () => {
    expect(sessionLossForm(new Error('db down'))).toBe(false);
    expect(sessionLossForm({ code: '57014' })).toBe(false);
    expect(sessionLossForm({ code: '23505' })).toBe(false);
    expect(sessionLossForm(new Error('take_ai_assistant_slot_failed'))).toBe(false);
    expect(sessionLossForm(null)).toBe(false);
    expect(sessionLossForm('42501')).toBe(false);
  });
});

describe('EZD-421 the shared ended-session rule', () => {
  let tenantId: string;
  let m: Member;

  beforeAll(async () => {
    tenantId = await createTenant();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    state.store = new Map();
    state.throwOnCreate = false;
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T3 the token has ended and the refresh is refused: 401 not_signed_in, no-store', async () => {
    m = await createMember({ tenantId, scope: 'all' });
    const { cookies, exp } = await signInCookies(m.email);
    state.store = new Map(cookies);
    pastExpiry(exp);
    const res = await endedSessionResponse(DENIED);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect(res!.headers.get('cache-control')).toBe('no-store');
    expect(await res!.json()).toEqual(NOT_SIGNED_IN);
  });

  it('T4 the session was ended in the database (token still valid): 401', async () => {
    m = await createMember({ tenantId, scope: 'all' });
    const { cookies } = await signInCookies(m.email);
    state.store = new Map(cookies);
    await harnessSql()`delete from auth.sessions where user_id = ${m.authUserId}::uuid`;
    const res = await endedSessionResponse(DENIED);
    expect(res?.status).toBe(401);
    expect(res?.headers.get('cache-control')).toBe('no-store');
    expect(await res?.json()).toEqual(NOT_SIGNED_IN);
  });

  it('T5 the session cookies are gone (cleared by a refused refresh earlier in the request): 401', async () => {
    state.store = new Map();
    const res = await endedSessionResponse(DENIED);
    expect(res?.status).toBe(401);
  });

  it('T6 a live session with the same 42501 keeps the 500 path', async () => {
    m = await createMember({ tenantId, scope: 'all' });
    const { cookies } = await signInCookies(m.email);
    state.store = new Map(cookies);
    await expect(endedSessionResponse(DENIED)).resolves.toBeNull();
    await expect(sessionEnded(DENIED)).resolves.toBe(false);
  });

  it('T7 an ended session with a failure that is not a session-loss form keeps the 500 path', async () => {
    state.store = new Map();
    await expect(endedSessionResponse(new Error('db down'))).resolves.toBeNull();
  });

  it('T8 the confirm step throwing keeps the 500 path (fails closed toward the alert)', async () => {
    state.store = new Map();
    state.throwOnCreate = true;
    await expect(endedSessionResponse(DENIED)).resolves.toBeNull();
  });

  it('T9 the token has ended but Auth fails the refresh with a 500: not confirmed, keeps the 500 path', async () => {
    m = await createMember({ tenantId, scope: 'all' });
    const { cookies, exp } = await signInCookies(m.email);
    state.store = new Map(cookies);
    pastExpiry(exp, 'status500');
    await expect(endedSessionResponse(DENIED)).resolves.toBeNull();
  });
});
