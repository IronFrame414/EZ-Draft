// EZD-108 T5 and T6 (vault/plans/EZD-108.md sections 3, 4 and Decided "Routes"; AC-EZD-108-3, -4): GET and
// PATCH /api/profile. next/headers is mocked and members sign in as in
// app/src/app/api/settings/customers/route.test.ts; emit is wrapped in vi.fn. Expected values: the EZD-007c
// 401 body, `{ error: { code, message_key: 'error.<code>' } }`, `Cache-Control: no-store`, Q-0392 (null
// iPad value reads as finger), S15 Events (`user.language_changed`); round 2 (Q-0465 (a)): `captcha` from
// captchaConfig (constants from app/src/server/auth/captcha-config.ts) and the reported dropped event.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../server/auth/supabase-server';
import { TURNSTILE_SCRIPT_URL, TURNSTILE_TEST_SITE_KEY } from '../../../server/auth/captcha-config';
import { reportError } from '../../../server/errors/report';
import { emit } from '../../../server/events';

vi.mock('../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});
const emitMock = vi.mocked(emit);

vi.mock('../../../server/errors/report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/errors/report')>();
  return { ...actual, reportError: vi.fn(async () => ({})) };
});
const reportMock = vi.mocked(reportError);

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
  const res = await GET(new Request('http://localhost/api/profile'));
  return { res, json: await parse(res) };
}
async function patch(raw: string): Promise<{ res: Response; json: unknown }> {
  const { PATCH } = await import('./route');
  const res = await PATCH(
    new Request('http://localhost/api/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  return { res, json: await parse(res) };
}

describe('EZD-108 profile routes', () => {
  let tenant = '';
  let member: Member;
  let memberCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    member = await createMember({ tenantId: tenant, scope: 'all' });
    memberCookies = await cookiesFor(member.email);
  }, 120000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    emitMock.mockClear();
    reportMock.mockClear();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T5 GET /api/profile: 401 without a session; 200 with finger, null name and no password for a fresh member', async () => {
    state.store = new Map();
    const none = await get();
    expect(none.res.status).toBe(401);
    expect(none.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(memberCookies);
    const ok = await get();
    expect(ok.res.status).toBe(200);
    expect(ok.res.headers.get('Cache-Control')).toBe('no-store');
    expect(ok.json).toEqual({
      profile: {
        name: null,
        email: member.email,
        language: 'en',
        ipadDrawing: 'finger',
        hasPassword: false,
      },
      captcha: null,
      aiKey: null,
    });

    vi.stubEnv('TURNSTILE_SITE_KEY', TURNSTILE_TEST_SITE_KEY);
    const stubbed = await get();
    vi.unstubAllEnvs();
    expect(stubbed.res.status).toBe(200);
    expect(stubbed.json).toMatchObject({
      captcha: { siteKey: '1x00000000000000000000AA', scriptUrl: TURNSTILE_SCRIPT_URL },
    });
  });

  it('T6 PATCH /api/profile: 400 on bad JSON; one event on a language change; none on a repeat; a throwing emit still saves', async () => {
    state.store = new Map();
    const noSession = await patch(JSON.stringify({ language: 'es', ipadDrawing: 'pencil' }));
    expect(noSession.res.status).toBe(401);
    expect(noSession.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(memberCookies);
    const bad = await patch('{not json');
    expect(bad.res.status).toBe(400);
    expect(bad.json).toEqual(INVALID);
    const badValue = await patch(JSON.stringify({ language: 'de', ipadDrawing: 'pencil' }));
    expect(badValue.res.status).toBe(400);
    expect(badValue.json).toEqual(INVALID);
    expect(emitMock).not.toHaveBeenCalled();

    const first = await patch(JSON.stringify({ language: 'es', ipadDrawing: 'pencil' }));
    expect(first.res.status).toBe(200);
    expect(first.res.headers.get('Cache-Control')).toBe('no-store');
    expect(first.json).toEqual({ profile: { language: 'es', ipadDrawing: 'pencil' } });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('user.language_changed');
    expect(emitMock.mock.calls[0][1]).toEqual({ appUserId: member.appUserId, language: 'es' });
    const rows = await harnessSql()`
      select language, ipad_input_mode from public.app_user where id = ${member.appUserId}::uuid`;
    expect(rows[0]).toMatchObject({ language: 'es', ipad_input_mode: 'pencil' });

    emitMock.mockClear();
    const again = await patch(JSON.stringify({ language: 'es', ipadDrawing: 'pencil' }));
    expect(again.res.status).toBe(200);
    expect(again.json).toEqual({ profile: { language: 'es', ipadDrawing: 'pencil' } });
    expect(emitMock).not.toHaveBeenCalled();

    emitMock.mockImplementationOnce(() => {
      throw new Error('emit down');
    });
    const throwing = await patch(JSON.stringify({ language: 'en', ipadDrawing: 'pencil' }));
    expect(throwing.res.status).toBe(200);
    expect(throwing.json).toEqual({ profile: { language: 'en', ipadDrawing: 'pencil' } });
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect((reportMock.mock.calls[0][0] as Error).message).toBe('profile_language_event_failed');
    const after = await harnessSql()`
      select language from public.app_user where id = ${member.appUserId}::uuid`;
    expect(after[0].language).toBe('en');
  });
});
