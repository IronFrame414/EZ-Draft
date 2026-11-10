// EZD-5601 T11-T16 (vault/plans/EZD-5601.md section 1 "D-POST order", "D-DELETE", "D-Responses", "D-Email",
// section 3 routes, section 4, section 6 subjects; AC-EZD-5601-1, -2, -4, -5, -6, -7, -9): POST and DELETE
// /api/profile/ai-key and GET /api/profile on the local stack. next/headers is mocked and members sign in
// with a cookie store each, as in app/src/app/api/profile/password/route.test.ts. Anthropic answers come from
// stub recordings (CLAUDE.md rule 6). The canary key is compared only through includes or booleans (L-018,
// L-019).
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import * as Sentry from '@sentry/nextjs';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../../test-harness/errors/alert-lock';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import { eventsIn } from '../../../../../test-harness/sentry-outbox';
import { clearLastRecordedRequests } from '../../../../server/ai/test-harness/recorded-fetch';
import type { Recording } from '../../../../server/ai/test-harness/recorded-fetch';
import {
  clearStubRecordings,
  lastStubRequests,
  setStubRecording,
} from '../../../../server/ai/test-harness/stub';
import { addUserAiKey } from '../../../../server/assistant/user-key';
import { decryptUserAiKey, parseEncryptionKeys } from '../../../../server/assistant/key-crypto';
import { refuseCrossOriginWrite } from '../../../../server/auth/same-origin';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
import { initErrorReporting } from '../../../../server/errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../../../../server/errors/test-harness/sentry-stub-transport';
import {
  clearStubOutbox,
  readStubOutbox,
} from '../../../../server/email/test-harness/stub-transport';

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

const CANARY = 'sk-ant-api03-EZD5601CANARY' + randomUUID().replaceAll('-', '');
const LAST4 = CANARY.slice(-4);
const TEST_KEYS = '1:' + Buffer.alloc(32).toString('base64');
const URL_KEY = 'http://localhost/api/profile/ai-key';
const MODELS_URL = 'https://api.anthropic.com/v1/models*';
const ADDED_SUBJECT = 'An Anthropic API key was added to your EZ Draft account';
const REMOVED_SUBJECT = 'The Anthropic API key was removed from your EZ Draft account';

const err = (code: string) => ({ error: { code, message_key: `error.${code}` } });

const errorBody = (type: string, message: string) => ({
  type: 'error',
  error: { type, message },
  request_id: 'req_1',
});
const recordFor = (status: number, json: unknown, delayMs?: number): Recording => ({
  provider: 'anthropic',
  purpose: 'key-check',
  source: 'synthetic',
  exchanges: [
    {
      match: { method: 'GET', url: MODELS_URL },
      response: { status, json, ...(delayMs === undefined ? {} : { delayMs }) },
    },
  ],
});
const REC_401 = () =>
  recordFor(401, errorBody('authentication_error', 'invalid x-api-key'));
const REC_402 = () => recordFor(402, errorBody('billing_error', 'no credit'));
const REC_500 = () => recordFor(500, errorBody('api_error', 'boom'));
const REC_SLOW = () => recordFor(200, { data: [] }, 500);

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function post(body: string): Promise<{ res: Response; json: unknown; text: string }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(URL_KEY, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );
  const text = await res.clone().text();
  return { res, json: await parse(res), text };
}
const postKey = (key: string) => post(JSON.stringify({ key }));

async function del(): Promise<{ res: Response; json: unknown; text: string }> {
  const { DELETE } = await import('./route');
  const res = await DELETE(new Request(URL_KEY, { method: 'DELETE' }));
  const text = await res.clone().text();
  return { res, json: await parse(res), text };
}

async function getProfile(): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('../route');
  const res = await GET(new Request('http://localhost/api/profile'));
  return { res, json: await parse(res) };
}

const mailTo = (email: string) => readStubOutbox().filter((m) => m.to.toLowerCase() === email);
const keyRows = (appUserId: string) =>
  harnessSql()<{ tenant_id: string; ciphertext: string; secret_version: number; last4: string }[]>`
    select tenant_id, ciphertext, secret_version, last4 from public.user_ai_key
    where app_user_id = ${appUserId}::uuid`;
const attemptCount = async (appUserId: string) =>
  (
    await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.ai_key_attempt where app_user_id = ${appUserId}::uuid`
  )[0].n;

// Every place a leaked key could land, as one text each.
const asText = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString('utf8');
  return null;
};

describe('EZD-5601 AI key route', () => {
  let tenant = '';
  let releaseLock: () => Promise<void> = async () => {};

  async function newMember(): Promise<{ member: Member; cookies: Map<string, string> }> {
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    return { member, cookies: await cookiesFor(member.email) };
  }

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    tenant = await createTenant();
  }, 180000);

  beforeEach(async () => {
    clearStubOutbox();
    clearSentryStubOutbox();
    clearStubRecordings();
    await harnessSql()`delete from public.error_alert`;
  });

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearStubRecordings();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await cleanup();
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('T11 add: a padded key at the size bound is checked, stored encrypted, shown as last4 and mailed once', async () => {
    const { member, cookies } = await newMember();
    state.store = new Map(cookies);
    const body = JSON.stringify({ key: '  ' + CANARY + '\n' }).padEnd(2048, ' ');
    expect(body.length).toBe(2048);
    const added = await post(body);
    expect(added.res.status).toBe(200);
    expect(added.res.headers.get('Cache-Control')).toBe('no-store');
    expect(added.json).toEqual({ aiKey: { last4: LAST4 } });
    expect(added.text.includes(CANARY)).toBe(false);

    const rows = await keyRows(member.appUserId);
    expect(rows).toHaveLength(1);
    expect(rows[0].secret_version).toBe(1);
    expect(rows[0].last4).toBe(LAST4);
    expect(rows[0].ciphertext === CANARY).toBe(false);
    expect(rows[0].ciphertext.includes(CANARY)).toBe(false);
    const plain = decryptUserAiKey(
      { ciphertext: rows[0].ciphertext, secretVersion: rows[0].secret_version },
      { tenantId: rows[0].tenant_id, appUserId: member.appUserId },
      parseEncryptionKeys({ AI_KEY_ENCRYPTION_KEYS: TEST_KEYS }),
    );
    expect(plain === CANARY).toBe(true);

    const profile = await getProfile();
    expect(profile.res.status).toBe(200);
    expect((profile.json as { aiKey: unknown }).aiKey).toEqual({ last4: LAST4 });
    expect(JSON.stringify(profile.json).includes(CANARY)).toBe(false);

    const sent = mailTo(member.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(ADDED_SUBJECT);
    expect(sent[0].text.includes(LAST4)).toBe(true);
    expect(sent[0].text.includes(CANARY)).toBe(false);
    expect(sent[0].html.includes(CANARY)).toBe(false);
  }, 120000);

  it('T12 add errors: each refusal has its status and code and stores and mails nothing', async () => {
    const { member, cookies } = await newMember();
    const nothingKept = async (name: string) => {
      expect(await keyRows(member.appUserId), name).toEqual([]);
      expect(mailTo(member.email), name).toHaveLength(0);
    };

    state.store = new Map();
    const anon = await postKey(CANARY);
    expect(anon.res.status).toBe(401);
    expect(anon.json).toEqual(err('not_signed_in'));

    state.store = new Map(cookies);
    const invalid: Array<[string, string]> = [
      ['not JSON', '{'],
      ['2,049 characters', JSON.stringify({ key: CANARY }).padEnd(2049, ' ')],
      ['key is a number', JSON.stringify({ key: 5 })],
      ['extra field', JSON.stringify({ key: CANARY, x: 1 })],
    ];
    for (const [name, text] of invalid) {
      const r = await post(text);
      expect(r.res.status, name).toBe(400);
      expect(r.json, name).toEqual(err('invalid_input'));
      await nothingKept(name);
    }

    clearLastRecordedRequests();
    const badShape = await postKey('sk-x');
    expect(badShape.res.status).toBe(400);
    expect(badShape.json).toEqual(err('ai_key_invalid'));
    expect(lastStubRequests('anthropic')).toHaveLength(0);
    expect(await attemptCount(member.appUserId)).toBe(0);
    await nothingKept('shape');

    const outcomes: Array<[string, () => Recording, number, string]> = [
      ['401', REC_401, 400, 'ai_key_refused'],
      ['402', REC_402, 400, 'ai_key_out_of_credit'],
      ['500', REC_500, 502, 'ai_key_check_failed'],
    ];
    for (const [name, recording, status, code] of outcomes) {
      setStubRecording('anthropic', 'key-check', recording());
      const r = await postKey(CANARY);
      expect(r.res.status, name).toBe(status);
      expect(r.json, name).toEqual(err(code));
      await nothingKept(name);
    }

    setStubRecording('anthropic', 'key-check', REC_SLOW());
    const session = {
      authUserId: member.authUserId,
      appUserId: member.appUserId,
      email: member.email,
    };
    const timedOut = await addUserAiKey(createSessionClient(jarOver(cookies)), session, CANARY, {
      budgetMs: 50,
    });
    expect(timedOut).toEqual({ status: 502, code: 'ai_key_check_failed' });
    await nothingKept('timeout');
  }, 120000);

  it('T13 the key never appears in a response, an email, a report, a log or a row, even when the save fails', async () => {
    const { member, cookies } = await newMember();
    state.store = new Map(cookies);
    const logged: string[] = [];
    let uninspectable = 0;
    const take = (args: unknown[]) => {
      for (const a of args) {
        const t = asText(a);
        if (t === null) {
          try {
            logged.push(inspect(a, { depth: null, showHidden: true }));
          } catch {
            uninspectable += 1;
          }
        } else logged.push(t);
      }
    };
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      const real = console[method].bind(console);
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        take(args);
        real(...args);
      });
    }
    for (const stream of [process.stdout, process.stderr]) {
      const real = stream.write.bind(stream);
      vi.spyOn(stream, 'write').mockImplementation(((chunk: unknown, ...rest: never[]) => {
        const t = asText(chunk);
        if (t === null) uninspectable += 1;
        else logged.push(t);
        return (real as (c: unknown, ...r: never[]) => boolean)(chunk, ...rest);
      }) as typeof stream.write);
    }

    const bodies: string[] = [];
    for (const recording of [REC_401, REC_500]) {
      setStubRecording('anthropic', 'key-check', recording());
      bodies.push((await postKey(CANARY)).text);
    }
    setStubRecording('anthropic', 'key-check', REC_SLOW());
    const session = {
      authUserId: member.authUserId,
      appUserId: member.appUserId,
      email: member.email,
    };
    const client = createSessionClient(jarOver(cookies));
    const slow = await addUserAiKey(client, session, CANARY, { budgetMs: 50 });
    bodies.push(JSON.stringify(slow));

    clearStubRecordings();
    const failing = new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === 'rpc') {
          return (fn: string, ...rest: unknown[]) =>
            fn === 'save_my_ai_key'
              ? Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } })
              : (target.rpc as (f: string, ...r: unknown[]) => unknown).call(target, fn, ...rest);
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    let rejected: unknown = null;
    try {
      await addUserAiKey(failing, session, CANARY);
    } catch (e) {
      rejected = e;
    }
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).message.includes(CANARY)).toBe(false);
    expect(String((rejected as Error).stack).includes(CANARY)).toBe(false);

    await Sentry.flush(2000);
    const alertRows = await harnessSql()`select e::text as t from public.error_alert e`;
    const keyRowText = await harnessSql()`select k::text as t from public.user_ai_key k`;
    const places: Array<[string, string]> = [
      ['responses', bodies.join('\n')],
      ['email outbox', JSON.stringify(readStubOutbox())],
      ['sentry outbox', JSON.stringify(eventsIn(readSentryStubOutbox()))],
      ['console and streams', logged.join('\n')],
      ['error_alert rows', JSON.stringify(alertRows.map((r) => r.t))],
      ['user_ai_key rows', JSON.stringify(keyRowText.map((r) => r.t))],
    ];
    expect(uninspectable).toBe(0);
    for (const [name, text] of places) expect(text.includes(CANARY), name).toBe(false);
  }, 120000);

  it('T14 a missing or malformed encryption setting answers 500 ai_key_unavailable and reports its code once per call', async () => {
    const { member, cookies } = await newMember();
    state.store = new Map(cookies);
    const cases: Array<[string, string]> = [
      ['', 'ai_key_config_missing'],
      ['1:QUJD', 'ai_key_config_invalid'],
    ];
    for (const [value, code] of cases) {
      clearSentryStubOutbox();
      clearLastRecordedRequests();
      vi.stubEnv('AI_KEY_ENCRYPTION_KEYS', value);
      const r = await postKey(CANARY);
      expect(r.res.status, code).toBe(500);
      expect(r.json, code).toEqual(err('ai_key_unavailable'));
      expect(lastStubRequests('anthropic'), code).toHaveLength(0);
      expect(await attemptCount(member.appUserId), code).toBe(0);
      expect(await keyRows(member.appUserId), code).toEqual([]);
      await Sentry.flush(2000);
      const events = eventsIn(readSentryStubOutbox());
      expect(events, code).toHaveLength(1);
      expect(events[0].exception.values[0].value).toBe(code);
      vi.unstubAllEnvs();
    }
  }, 120000);

  it('T15 a sixth try within 15 minutes is throttled before Anthropic is asked; a cross-site write is refused', async () => {
    const { member, cookies } = await newMember();
    state.store = new Map(cookies);
    setStubRecording('anthropic', 'key-check', REC_401());
    for (let i = 0; i < 5; i++) {
      const r = await postKey(CANARY);
      expect(r.res.status, `try ${i + 1}`).toBe(400);
    }
    expect(await attemptCount(member.appUserId)).toBe(5);
    clearLastRecordedRequests();
    const sixth = await postKey(CANARY);
    expect(sixth.res.status).toBe(429);
    expect(sixth.json).toEqual(err('ai_key_throttled'));
    expect(lastStubRequests('anthropic')).toHaveLength(0);
    expect(await keyRows(member.appUserId)).toEqual([]);

    for (const method of ['POST', 'DELETE']) {
      const refused = refuseCrossOriginWrite(
        new NextRequest('http://127.0.0.1:3000/api/profile/ai-key', {
          method,
          headers: { 'sec-fetch-site': 'cross-site' },
        }),
      );
      expect(refused, method).not.toBeNull();
      expect(refused?.status, method).toBe(403);
      const json = (await refused?.json()) as { error: { code: string } };
      expect(json.error.code, method).toBe('cross_origin_refused');
    }
  }, 120000);

  it('T16 remove: the row goes and one email names the last four; a second remove is a quiet 200; no session is 401', async () => {
    const { member, cookies } = await newMember();
    state.store = new Map(cookies);
    expect((await postKey(CANARY)).res.status).toBe(200);
    expect(await keyRows(member.appUserId)).toHaveLength(1);
    clearStubOutbox();

    const first = await del();
    expect(first.res.status).toBe(200);
    expect(first.json).toEqual({ aiKey: null });
    expect(await keyRows(member.appUserId)).toEqual([]);
    const sent = mailTo(member.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(REMOVED_SUBJECT);
    expect(sent[0].text.includes(LAST4)).toBe(true);
    expect(sent[0].text.includes(CANARY)).toBe(false);

    clearStubOutbox();
    const second = await del();
    expect(second.res.status).toBe(200);
    expect(second.json).toEqual({ aiKey: null });
    expect(mailTo(member.email)).toHaveLength(0);

    state.store = new Map();
    const anon = await del();
    expect(anon.res.status).toBe(401);
    expect(anon.json).toEqual(err('not_signed_in'));
  }, 120000);
});
