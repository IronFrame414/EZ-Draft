// EZD-034 T2-T8 (vault/plans/EZD-034.md Tests; Step 3; R-013 (2), (4); Q-0242 (a); Q-0251 (a); Q-0252; Q-0104 (i)):
// the sign-in actions pass the captcha token to Auth and map Auth's captcha refusal. Local stack, where Auth's
// captcha is off (Q-0243 (c)); a refusal is stubbed by a fetch spy that passes everything else through.
// next/headers is mocked as in throttle.db.test.ts (in-memory cookies, x-forwarded-for when a case gives one).
// IP cases use their own TEST-NET-3 addresses, cleared before and after. Sends to one address are spaced by the
// local [auth.email] max_frequency plus 100 ms.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestMembers,
  createPasswordMember,
  createTestMember,
} from '../../../test-harness/auth-users';
import { waitForAuthEmail } from '../../../test-harness/mail-catcher';
import {
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
} from '../../../test-harness/rls/fixtures';
import { throttleRows, type ThrottleKind } from '../../../test-harness/throttle';
import { requestSignIn, signInWithPassword } from './actions';
import { throttleKey } from './throttle';

type Write = { name: string; value: string; options: Record<string, unknown>; deleted: boolean };
type Store = { map: Map<string, string>; writes: Write[] };

const state = vi.hoisted(() => ({
  store: { map: new Map<string, string>(), writes: [] as unknown[] } as {
    map: Map<string, string>;
    writes: unknown[];
  },
  xff: null as string | null,
}));

vi.mock('next/headers', () => ({
  cookies: async () => {
    const s = state.store;
    const record = (name: string, value: string, options: Record<string, unknown>) => {
      const deleted = value === '' || options.maxAge === 0;
      s.writes.push({ name, value, options, deleted });
      if (deleted) s.map.delete(name);
      else s.map.set(name, value);
    };
    const jar = {
      get: (name: string) => (s.map.has(name) ? { name, value: s.map.get(name) } : undefined),
      getAll: () => [...s.map].map(([name, value]) => ({ name, value })),
      has: (name: string) => s.map.has(name),
      set: (...args: unknown[]) => {
        if (typeof args[0] === 'object' && args[0] !== null) {
          const { name, value, ...options } = args[0] as Record<string, unknown>;
          record(String(name), String(value ?? ''), options);
        } else {
          record(
            String(args[0]),
            String(args[1] ?? ''),
            (args[2] as Record<string, unknown> | undefined) ?? {},
          );
        }
        return jar;
      },
      delete: (arg: unknown) => {
        const name =
          typeof arg === 'object' && arg !== null
            ? String((arg as { name: unknown }).name)
            : String(arg);
        s.writes.push({ name, value: '', options: { maxAge: 0 }, deleted: true });
        s.map.delete(name);
        return jar;
      },
    };
    return jar;
  },
  headers: async () => {
    const h = new Headers();
    if (state.xff) h.set('x-forwarded-for', state.xff);
    return h;
  },
}));

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const macrotask = () => sleep(0);
const newStore = (): Store => ({ map: new Map(), writes: [] });
const activate = (store: Store) => {
  state.store = store as unknown as typeof state.store;
};

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

type Outcome = { redirect: string } | { resolved: unknown };

async function run(store: Store, action: () => Promise<unknown>): Promise<Outcome> {
  activate(store);
  try {
    const value = await action();
    await macrotask();
    return { resolved: value };
  } catch (e) {
    await macrotask();
    const digest = (e as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      return { redirect: digest.split(';').slice(2, -2).join(';') };
    }
    throw e;
  }
}

const sbWrites = (store: Store) =>
  store.writes.filter(
    (w) => w.name.startsWith('sb-') && !w.name.endsWith('-code-verifier') && w.value !== '',
  );
const writesOf = (store: Store, name: string) => store.writes.filter((w) => w.name === name);

const unknownEmail = () => `nobody-${randomUUID().slice(0, 12)}@example.test`;

async function failedRows(kind: ThrottleKind, key: string): Promise<number> {
  const rows = await harnessSql()`
    select count(*)::int as n from public.sign_in_throttle
    where kind = ${kind} and key_hash = ${key} and failed`;
  return rows[0].n as number;
}

function maxFrequencyMs(): number {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const toml = readFileSync(
    path.join(here, '..', '..', '..', '..', 'supabase', 'config.toml'),
    'utf8',
  );
  const start = toml.indexOf('\n[auth.email]\n');
  const rest = toml.slice(start + 1);
  const next = rest.slice(1).search(/\n\[/);
  const table = next < 0 ? rest : rest.slice(0, next + 1);
  const m = /^\s*max_frequency\s*=\s*"(\d+)(s|ms)"/m.exec(table);
  if (!m) throw new Error('max_frequency not found in config.toml [auth.email]');
  return m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
}

const lastSend = new Map<string, number>();
async function spaced(email: string, gapMs: number) {
  const last = lastSend.get(email);
  if (last !== undefined) {
    const wait = last + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
  }
  lastSend.set(email, Date.now());
}

type Seen = { path: string; body: Record<string, unknown> };
type Stub = { status: number; body: Record<string, unknown> };

// Fetch spy: records the JSON body of every Auth /otp and /token request; answers the stubbed path with the
// given status and body (without calling Auth); passes everything else through.
function spyAuth(stubs: { otp?: Stub; token?: Stub } = {}) {
  const seen: Seen[] = [];
  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input as RequestInfo | URL, init as RequestInit | undefined);
    const u = new URL(req.url);
    const isAuth = req.url.startsWith(`${url()}/auth/v1/`);
    const kind = isAuth && u.pathname.endsWith('/auth/v1/otp') ? 'otp' : null;
    const kind2 = isAuth && u.pathname.endsWith('/auth/v1/token') ? 'token' : kind;
    if (kind2) {
      const text =
        typeof init?.body === 'string'
          ? init.body
          : await req
              .clone()
              .text()
              .catch(() => '');
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        body = {};
      }
      seen.push({ path: u.pathname, body });
      const stub = kind2 === 'otp' ? stubs.otp : stubs.token;
      if (stub) {
        return new Response(JSON.stringify(stub.body), {
          status: stub.status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return realFetch(input, init);
  });
  return { seen, restore: () => spy.mockRestore() };
}

const captchaRefusal: Stub = {
  status: 400,
  body: { code: 400, error_code: 'captcha_failed', msg: 'captcha protection: request disallowed' },
};

const IP_OTP = '203.0.113.34';
const IP_PW = '203.0.113.35';

const metaToken = (b: Record<string, unknown>) =>
  (b.gotrue_meta_security as { captcha_token?: unknown } | undefined)?.captcha_token;

describe('EZD-034 captcha on the sign-in actions', () => {
  let tenant: string;
  const gap = () => maxFrequencyMs() + 100;

  const clearIps = async () => {
    for (const addr of [IP_OTP, IP_PW]) {
      await harnessSql()`
        delete from public.sign_in_throttle
        where kind = 'ip' and key_hash = ${throttleKey('ip', addr)}`;
    }
  };

  beforeAll(async () => {
    tenant = await createTenant();
    await clearIps();
  });

  beforeEach(() => {
    state.xff = null;
    activate(newStore());
  });

  afterAll(async () => {
    await clearIps();
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  // T2 (AC-EZD-034-2): R-013 (4); auth-js signInWithOtp body gotrue_meta_security.captcha_token; Step 3.
  it('EZD-034 T2 requestSignIn passes captcha_token to Auth only when it is a non-empty string', async () => {
    const m = await createTestMember({ tenantId: tenant, status: 'active' });
    const { seen, restore } = spyAuth();
    try {
      const cases: [Record<string, string>, unknown][] = [
        [{ email: m.email, captcha_token: 'tok-1' }, 'tok-1'],
        [{ email: m.email }, undefined],
        [{ email: m.email, captcha_token: '' }, undefined],
      ];
      for (const [fields, expected] of cases) {
        await spaced(m.email, gap());
        seen.length = 0;
        expect(await run(newStore(), () => requestSignIn(form(fields)))).toEqual({
          resolved: { step: 'code' },
        });
        const otp = seen.filter((s) => s.path.endsWith('/auth/v1/otp'));
        expect(otp.length).toBe(1);
        expect(metaToken(otp[0].body)).toBe(expected);
      }
    } finally {
      restore();
    }
  }, 120000);

  // T3 (AC-EZD-034-2): same source; auth-js signInWithPassword body.
  it('EZD-034 T3 signInWithPassword passes captcha_token to Auth', async () => {
    const m = await createPasswordMember({ tenantId: tenant });
    const { seen, restore } = spyAuth();
    try {
      const out = await run(newStore(), () =>
        signInWithPassword(form({ email: m.email, password: m.password, captcha_token: 'tok-2' })),
      );
      expect(out).toEqual({ redirect: '/' });
      const tokens = seen.filter((s) => s.path.endsWith('/auth/v1/token'));
      expect(tokens.length).toBeGreaterThanOrEqual(1);
      expect(metaToken(tokens[0].body)).toBe('tok-2');
    } finally {
      restore();
    }
  }, 60000);

  // T4 (AC-EZD-034-1, -2): Q-0252; Q-0104 (i): a refused code request still counts.
  it('EZD-034 T4 a captcha refusal on a code request is captcha_failed, sets no cookie and still counts', async () => {
    state.xff = IP_OTP;
    await clearIps();
    const email = unknownEmail();
    const store = newStore();
    const { restore } = spyAuth({ otp: captchaRefusal });
    try {
      expect(await run(store, () => requestSignIn(form({ email, captcha_token: 'bad' })))).toEqual({
        resolved: { error: 'captcha_failed' },
      });
    } finally {
      restore();
    }
    expect(writesOf(store, 'ezd_sign_in_email').filter((w) => !w.deleted)).toEqual([]);
    expect(await failedRows('email', throttleKey('email', email))).toBe(1);
    expect(await failedRows('ip', throttleKey('ip', IP_OTP))).toBe(1);
    await clearIps();
  }, 60000);

  // T5 (AC-EZD-034-1, -2): Q-0251 (a): a refused password attempt is settled, not counted.
  it('EZD-034 T5 a captcha refusal on a password sign-in is captcha_failed and settles its rows', async () => {
    state.xff = IP_PW;
    await clearIps();
    const m = await createPasswordMember({ tenantId: tenant });
    const store = newStore();
    const { restore } = spyAuth({ token: captchaRefusal });
    try {
      expect(
        await run(store, () =>
          signInWithPassword(form({ email: m.email, password: m.password, captcha_token: 'bad' })),
        ),
      ).toEqual({ resolved: { error: 'captcha_failed' } });
    } finally {
      restore();
    }
    const pwKey = throttleKey('email', m.email);
    const ipKey = throttleKey('ip', IP_PW);
    expect(await throttleRows('password', pwKey)).toBe(1);
    expect(await failedRows('password', pwKey)).toBe(0);
    expect(await throttleRows('ip', ipKey)).toBe(1);
    expect(await failedRows('ip', ipKey)).toBe(0);
    expect(sbWrites(store)).toEqual([]);
    await clearIps();
  }, 60000);

  // T6 (AC-EZD-034-2): Q-0251 (a) "never on bare HTTP 400"; EZD-033 counting.
  it('EZD-034 T6 a plain HTTP 400 invalid_credentials stays password_wrong and counts', async () => {
    await clearIps();
    state.xff = IP_PW;
    const m = await createPasswordMember({ tenantId: tenant });
    const { restore } = spyAuth({
      token: {
        status: 400,
        body: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
      },
    });
    try {
      expect(
        await run(newStore(), () =>
          signInWithPassword(form({ email: m.email, password: m.password, captcha_token: 'tok' })),
        ),
      ).toEqual({ resolved: { error: 'password_wrong' } });
    } finally {
      restore();
    }
    expect(await failedRows('password', throttleKey('email', m.email))).toBe(1);
    expect(await failedRows('ip', throttleKey('ip', IP_PW))).toBe(1);
    await clearIps();
  }, 60000);

  // T7 (AC-EZD-034-2): actions.ts keeps throwing for any other Auth error on a code request.
  it('EZD-034 T7 another 400 on a code request still throws sign_in_request_failed', async () => {
    const { restore } = spyAuth({
      otp: { status: 400, body: { code: 400, error_code: 'validation_failed', msg: 'x' } },
    });
    try {
      await expect(
        run(newStore(), () => requestSignIn(form({ email: unknownEmail(), captcha_token: 't' }))),
      ).rejects.toThrow('sign_in_request_failed');
    } finally {
      restore();
    }
  }, 60000);

  // T8 (AC-EZD-034-1): Q-0242 (a) condition (L-009): a wrong code is refused the same with and without an account.
  it('EZD-034 T8 verifyOtp answers an unknown email and a wrong code for a member the same way', async () => {
    const client = () =>
      createClient(url(), publishable(), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const ghost = unknownEmail();
    const a = await client().auth.verifyOtp({ email: ghost, token: '123456', type: 'email' });

    const m = await createTestMember({ tenantId: tenant, status: 'active' });
    const b = client();
    const before = new Date();
    const sent = await b.auth.signInWithOtp({ email: m.email });
    expect(sent.error).toBeNull();
    const { code } = await waitForAuthEmail(m.email, { after: before });
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    const r = await b.auth.verifyOtp({ email: m.email, token: wrong, type: 'email' });

    expect(a.error).not.toBeNull();
    expect(r.error).not.toBeNull();
    expect(r.error?.status).toBe(a.error?.status);
    expect(r.error?.code).toBe(a.error?.code);
  }, 120000);
});
