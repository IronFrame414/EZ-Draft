// EZD-007d T4, T5, T6, T8, T13, T19, T26 part d, T27, T36 (vault/plans/EZD-007d.md sections 3 and 4):
// the sign-in actions, completeSignIn and invite acceptance. Uses the EZD-004b/EZD-006 Vitest global setup
// (local stack, per-run SUPABASE_API_GATE_SECRET). next/headers is mocked as in EZD-007c's session.test.ts:
// cookies() is an in-memory store per person (get, getAll, set in both forms, delete; writes recorded with
// options), headers() is new Headers() unless a case sets x-forwarded-proto. redirect is not mocked: a
// success is a rejection whose digest URL part (Next.js 16.4.2 redirect.js getURLFromRedirectError) is the
// target. emit is wrapped in vi.fn over createEmitter({ sinks: [] }).emit, so the registry check stays.
// Emails are read from the local mail catcher (CLAUDE.md rule 6); sends to one address 1,100 ms apart (D2).
// Members are made fresh in fresh tenants; no seeded row changes. Expected values: section 4 Sources.
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asClaims,
  claimsOf,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  sessionCount,
} from '../../../test-harness/rls/fixtures';
import {
  addMembership,
  cleanupTestMembers,
  createTestMember,
  type TestMember,
} from '../../../test-harness/auth-users';
import { countAuthEmails, waitForAuthEmail } from '../../../test-harness/mail-catcher';
import { JOSH_USER_ID } from '../../../test-utils/seed-ids';
import type { Database } from '../db/database.types';
import { emit } from '../events';
import { createSessionClient, type SessionCookieJar } from './supabase-server';
import { getSession, requireApiSession } from './session';
import { completeSignIn } from './complete-sign-in';
import { confirmSignInLink, requestSignIn, setSignInLanguage, verifySignInCode } from './actions';

type Write = { name: string; value: string; options: Record<string, unknown>; deleted: boolean };
type Store = { map: Map<string, string>; writes: Write[] };

const state = vi.hoisted(() => ({
  store: { map: new Map<string, string>(), writes: [] as unknown[] } as {
    map: Map<string, string>;
    writes: unknown[];
  },
  proto: null as string | null,
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
    if (state.proto) h.set('x-forwarded-proto', state.proto);
    return h;
  },
}));

vi.mock('../events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});

const emitMock = vi.mocked(emit);
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const NOT_SIGNED_IN_BODY = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const SIGN_IN_EMAIL = 'ezd_sign_in_email';
const DAY = 86_400_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const macrotask = () => sleep(0);

const newStore = (entries: [string, string][] = []): Store => ({
  map: new Map(entries),
  writes: [],
});
const activate = (store: Store) => {
  state.store = store as unknown as typeof state.store;
};

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

type Outcome = { redirect: string } | { resolved: unknown };

// Runs an action with the given store; a Next.js redirect rejection becomes { redirect: <url> }.
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

// D2: sends to one address at least 1,100 ms apart.
const lastSend = new Map<string, number>();
async function spaced(email: string) {
  const last = lastSend.get(email);
  if (last !== undefined) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
  }
  lastSend.set(email, Date.now());
}

async function request(store: Store, email: string): Promise<{ result: unknown; before: Date }> {
  await spaced(email);
  const before = new Date();
  const out = await run(store, () => requestSignIn(form({ email })));
  expect(out).toHaveProperty('resolved');
  return { result: (out as { resolved: unknown }).resolved, before };
}

// requestSignIn, then verifySignInCode with the emailed code (email from the cookie).
async function signInByCode(store: Store, email: string): Promise<Outcome> {
  const { result, before } = await request(store, email);
  expect(result).toEqual({ step: 'code' });
  const mail = await waitForAuthEmail(email, { after: before });
  return run(store, () => verifySignInCode(form({ code: mail.code })));
}

function jarOver(map: Map<string, string>): SessionCookieJar {
  const copy = new Map(map);
  return {
    getAll: () => [...copy].map(([name, value]) => ({ name, value })),
    set: (name, value) => {
      copy.set(name, value);
    },
    isHttps: () => false,
  };
}

async function accessToken(store: Store): Promise<string> {
  const { data, error } = await createSessionClient(jarOver(store.map)).auth.getSession();
  expect(error).toBeNull();
  expect(data.session).not.toBeNull();
  return data.session!.access_token;
}

async function authUsersWithEmail(email: string): Promise<number> {
  const rows = await harnessSql()`
    select count(*)::int as n from auth.users where email = ${email}`;
  return rows[0].n as number;
}

async function authUserId(email: string): Promise<string> {
  const rows = await harnessSql()`select id from auth.users where email = ${email}`;
  expect(rows.length).toBe(1);
  return rows[0].id as string;
}

async function membershipRow(id: string): Promise<{ status: string; invited_at: Date | null }> {
  const rows = await harnessSql()`
    select status, invited_at from public.membership where id = ${id}::uuid`;
  return rows[0] as { status: string; invited_at: Date | null };
}

const writesOf = (store: Store, name: string) => store.writes.filter((w) => w.name === name);
const sbWrites = (store: Store) =>
  store.writes.filter((w) => w.name.startsWith('sb-') && w.value !== '');

type StubResult = { data: unknown; error: unknown };

function stubClient(opts: { rpc: StubResult; refresh?: { error: unknown } }) {
  const calls = { rpc: [] as unknown[][], signOut: [] as unknown[][], refresh: 0 };
  const client = {
    rpc: (...args: unknown[]) => {
      calls.rpc.push(args);
      return Promise.resolve(opts.rpc);
    },
    auth: {
      signOut: async (...args: unknown[]) => {
        calls.signOut.push(args);
        return { error: null };
      },
      refreshSession: async () => {
        calls.refresh += 1;
        return opts.refresh
          ? { data: { session: null, user: null }, error: opts.refresh.error }
          : { data: { session: {}, user: {} }, error: null };
      },
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

async function settle(p: Promise<unknown>) {
  return p.then(
    (value) => ({ ok: true as const, value }),
    (reason: unknown) => ({ ok: false as const, reason }),
  );
}

describe('EZD-007d sign-in actions and invite acceptance', () => {
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
  });

  beforeEach(() => {
    state.proto = null;
    activate(newStore());
    emitMock.mockClear();
  });

  afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  it('EZD-007d done when: requesting sign-in sends one bilingual email with a link and a 6-digit code', async () => {
    const m = await createTestMember({ tenantId: tenantA, status: 'active' });
    const { result, before } = await request(newStore(), m.email);
    expect(result).toEqual({ step: 'code' });
    const mail = await waitForAuthEmail(m.email, { after: before });
    await sleep(3000);
    expect(await countAuthEmails(m.email, { after: before })).toBe(1);

    const decoded = mail.html.replace(/&amp;/g, '&');
    const confirm = /https?:\/\/[^\s"'<>()]*\/auth\/confirm\?[^\s"'<>()]*/g;
    const all = [...(mail.text.match(confirm) ?? []), ...(decoded.match(confirm) ?? [])];
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(new Set(all).size).toBe(1);
    expect(all[0]).toBe(mail.link);
    const hrefs = [...decoded.matchAll(/href\s*=\s*"([^"]*)"/g)].map((h) => h[1]);
    expect(hrefs.filter((h) => h === mail.link).length).toBe(2);
    expect(mail.link.startsWith('http://127.0.0.1:3000/auth/confirm?')).toBe(true);
    const link = new URL(mail.link);
    expect(link.searchParams.get('type')).toBe('email');
    expect((link.searchParams.get('token_hash') ?? '').length).toBeGreaterThan(0);

    expect(mail.code).toMatch(/^\d{6}$/);
    const en = mail.html.search(/lang="en"/);
    const es = mail.html.search(/lang="es"/);
    expect(en).toBeGreaterThanOrEqual(0);
    expect(es).toBeGreaterThan(en);
    expect(mail.html.slice(en, es)).toContain(mail.code);
    expect(mail.html.slice(es)).toContain(mail.code);
    expect(mail.subject).toMatch(/^Your EZ Draft sign-in link and code \/ .*\S/);
  }, 60000);

  it('EZD-007d T5 first sign-in links the app_user', async () => {
    const f = await createTestMember({ tenantId: tenantA, status: 'active' });
    expect(await signInByCode(newStore(), f.email)).toEqual({ redirect: '/' });
    const authId = await authUserId(f.email);
    const linked = await harnessSql()`
      select auth_user_id from public.app_user where id = ${f.appUserId}::uuid`;
    expect(linked[0].auth_user_id).toBe(authId);

    expect(await signInByCode(newStore(), f.email)).toEqual({ redirect: '/' });
    const again = await harnessSql()`
      select auth_user_id from public.app_user where id = ${f.appUserId}::uuid`;
    expect(again[0].auth_user_id).toBe(authId);

    const josh = await harnessSql()`
      select auth_user_id from public.app_user where id = ${JOSH_USER_ID}::uuid`;
    expect(josh[0].auth_user_id).toBeNull();
  }, 60000);

  it('EZD-007d done when: an unknown address gets the same answer and no email', async () => {
    // (a)
    const unknown = `nobody-${randomUUID().slice(0, 12)}@example.test`;
    const storeU = newStore();
    const u = await request(storeU, unknown);
    const known = await createTestMember({ tenantId: tenantA, status: 'active' });
    const storeK = newStore();
    const k = await request(storeK, known.email);
    expect(k.result).toEqual({ step: 'code' });
    expect(u.result).toEqual(k.result);
    const cu = writesOf(storeU, SIGN_IN_EMAIL);
    const ck = writesOf(storeK, SIGN_IN_EMAIL);
    expect(cu.length).toBeGreaterThanOrEqual(1);
    expect(ck.length).toBeGreaterThanOrEqual(1);
    expect(cu[cu.length - 1].options).toEqual(ck[ck.length - 1].options);
    expect(await authUsersWithEmail(unknown)).toBe(0);
    await sleep(3000);
    expect(await countAuthEmails(unknown)).toBe(0);

    // (b) real Auth, back to back, no 1,100 ms wait
    const member = await createTestMember({ tenantId: tenantA, status: 'active' });
    const unknown2 = `nobody-${randomUUID().slice(0, 12)}@example.test`;
    const before = new Date();
    const answers: unknown[] = [];
    for (const email of [member.email, member.email, unknown2, unknown2]) {
      const out = await run(newStore(), () => requestSignIn(form({ email })));
      answers.push((out as { resolved?: unknown }).resolved);
    }
    lastSend.set(member.email, Date.now());
    for (const a of answers) expect(a).toEqual({ step: 'code' });
    await waitForAuthEmail(member.email, { after: before });
    await sleep(3000);
    expect(await countAuthEmails(member.email, { after: before })).toBe(1);
    expect(await countAuthEmails(unknown2)).toBe(0);
  }, 60000);

  it('EZD-007d done when: verifying the code links the app_user, accepts the most recently sent valid pending invite and emits user.joined', async () => {
    const now = Date.now();

    // (a) active in A
    const a = await createTestMember({ tenantId: tenantA, status: 'active' });
    emitMock.mockClear();
    expect(await signInByCode(newStore(), a.email)).toEqual({ redirect: '/' });
    expect(emitMock).not.toHaveBeenCalled();

    // (b) deactivated, (d) invite sent 7 days 1 minute ago, (e) invite with no sent date
    const b = await createTestMember({ tenantId: tenantA, status: 'deactivated' });
    const d = await createTestMember({
      tenantId: tenantA,
      status: 'invited',
      invitedAt: new Date(now - 7 * DAY - 60_000),
    });
    const e = await createTestMember({ tenantId: tenantA, status: 'invited', invitedAt: null });
    const refused: { m: TestMember; before: Date }[] = [];
    for (const m of [b, d, e]) {
      const { result, before } = await request(newStore(), m.email);
      expect(result).toEqual({ step: 'code' });
      refused.push({ m, before });
    }
    await sleep(3000);
    for (const { m, before } of refused) {
      expect(await countAuthEmails(m.email, { after: before })).toBe(0);
      expect(await authUsersWithEmail(m.email)).toBe(0);
    }
    expect((await membershipRow(d.membershipId)).status).toBe('invited');
    expect((await membershipRow(e.membershipId)).status).toBe('invited');

    // (c) invite sent 6 days 23 hours ago
    const c = await createTestMember({
      tenantId: tenantA,
      status: 'invited',
      invitedAt: new Date(now - 6 * DAY - 23 * 3_600_000),
    });
    const cBefore = await membershipRow(c.membershipId);
    emitMock.mockClear();
    const storeC = newStore();
    expect(await signInByCode(storeC, c.email)).toEqual({ redirect: '/' });
    const cAfter = await membershipRow(c.membershipId);
    expect(cAfter.status).toBe('active');
    expect(cAfter.invited_at?.toISOString()).toBe(cBefore.invited_at?.toISOString());
    activate(storeC);
    expect(await getSession()).not.toBeNull();
    expect(await sessionCount(await authUserId(c.email))).toBe(1);
    expect(claimsOf(await accessToken(storeC)).tenant_id).toBe(tenantA);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'user.joined',
      { membershipId: c.membershipId, appUserId: c.appUserId, via: 'sign_in' },
      { tenantId: tenantA, actorId: c.appUserId },
    );
    expect(await signInByCode(newStore(), c.email)).toEqual({ redirect: '/' });
    expect(emitMock).toHaveBeenCalledTimes(1);

    // (f) active in A plus an invite in B sent 1 day ago
    const f = await createTestMember({ tenantId: tenantA, status: 'active' });
    const fB = await addMembership({
      appUserId: f.appUserId,
      tenantId: tenantB,
      status: 'invited',
      invitedAt: new Date(now - DAY),
    });
    emitMock.mockClear();
    const storeF = newStore();
    expect(await signInByCode(storeF, f.email)).toEqual({ redirect: '/' });
    expect(claimsOf(await accessToken(storeF)).tenant_id).toBe(tenantA);
    expect((await membershipRow(fB.membershipId)).status).toBe('invited');
    expect(emitMock).not.toHaveBeenCalled();

    // (g) invite in A sent 2 days ago, invite in B sent 1 day ago
    const g = await createTestMember({
      tenantId: tenantA,
      status: 'invited',
      invitedAt: new Date(now - 2 * DAY),
    });
    const gB = await addMembership({
      appUserId: g.appUserId,
      tenantId: tenantB,
      status: 'invited',
      invitedAt: new Date(now - DAY),
    });
    const gBBefore = await membershipRow(gB.membershipId);
    emitMock.mockClear();
    const storeG = newStore();
    expect(await signInByCode(storeG, g.email)).toEqual({ redirect: '/' });
    const gBAfter = await membershipRow(gB.membershipId);
    expect(gBAfter.status).toBe('active');
    expect(gBAfter.invited_at?.toISOString()).toBe(gBBefore.invited_at?.toISOString());
    expect((await membershipRow(g.membershipId)).status).toBe('invited');
    expect(claimsOf(await accessToken(storeG)).tenant_id).toBe(tenantB);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'user.joined',
      { membershipId: gB.membershipId, appUserId: g.appUserId, via: 'sign_in' },
      { tenantId: tenantB, actorId: g.appUserId },
    );
    const storeG2 = newStore();
    expect(await signInByCode(storeG2, g.email)).toEqual({ redirect: '/' });
    expect(claimsOf(await accessToken(storeG2)).tenant_id).toBe(tenantB);
    expect((await membershipRow(g.membershipId)).status).toBe('invited');
    expect(emitMock).toHaveBeenCalledTimes(1);

    // (h) active, signs in once, then deactivated, then requests and verifies again
    const h = await createTestMember({ tenantId: tenantA, status: 'active' });
    expect(await signInByCode(newStore(), h.email)).toEqual({ redirect: '/' });
    await harnessSql()`
      update public.membership set status = 'deactivated' where id = ${h.membershipId}::uuid`;
    const storeH = newStore();
    const { result, before } = await request(storeH, h.email);
    expect(result).toEqual({ step: 'code' });
    const mail = await waitForAuthEmail(h.email, { after: before });
    const out = await run(storeH, () => verifySignInCode(form({ code: mail.code })));
    expect(out).toEqual({ resolved: { error: 'no_access' } });
    expect([...storeH.map].filter(([n, v]) => n.startsWith('sb-') && v !== '')).toEqual([]);
    activate(storeH);
    expect(await getSession()).toBeNull();
    expect(storeH.map.get(SIGN_IN_EMAIL) ?? '').not.toBe('');
  }, 180000);

  it('EZD-007d done when: sessions are kept in httpOnly cookies for 400 days from last use', async () => {
    const m = await createTestMember({ tenantId: tenantA, status: 'active' });
    for (const [proto, secure] of [
      [null, false],
      ['https', true],
    ] as const) {
      state.proto = proto;
      const store = newStore();
      const { result, before } = await request(store, m.email);
      expect(result).toEqual({ step: 'code' });
      const emailWrites = writesOf(store, SIGN_IN_EMAIL);
      expect(emailWrites.length).toBeGreaterThanOrEqual(1);
      const set = emailWrites[emailWrites.length - 1];
      expect(set.value).toBe(m.email.toLowerCase());
      expect(set.options.httpOnly).toBe(true);
      expect(set.options.maxAge).toBe(900);
      expect(set.options.secure).toBe(secure);

      const mail = await waitForAuthEmail(m.email, { after: before });
      const mark = store.writes.length;
      const out = await run(store, () => verifySignInCode(form({ code: mail.code })));
      expect(out).toEqual({ redirect: '/' });

      const sb = sbWrites(store);
      expect(sb.length).toBeGreaterThanOrEqual(1);
      for (const w of sb) {
        expect(w.options.httpOnly).toBe(true);
        expect(w.options.sameSite).toBe('lax');
        expect(w.options.path).toBe('/');
        expect(w.options.maxAge).toBe(34560000);
        expect(w.options.secure).toBe(secure);
      }
      expect(store.writes.slice(mark).some((w) => w.name === SIGN_IN_EMAIL && w.deleted)).toBe(
        true,
      );
    }
  }, 60000);

  it('EZD-007d done when: an ended session fails closed', async () => {
    const e = await createTestMember({ tenantId: tenantA, status: 'active' });
    const store = newStore();
    expect(await signInByCode(store, e.email)).toEqual({ redirect: '/' });
    activate(store);
    expect((await getSession())?.appUserId).toBe(e.appUserId);
    const token = await accessToken(store);

    await harnessSql()`
      update public.membership set status = 'deactivated' where id = ${e.membershipId}::uuid`;
    activate(store);
    expect(await getSession()).toBeNull();
    activate(store);
    const res = await requireApiSession();
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    expect(await (res as Response).json()).toEqual(NOT_SIGNED_IN_BODY);
    const rows = await asClaims(token, (tx) => tx`select public.current_app_user_id() as id`);
    expect(rows[0].id).toBeNull();
  }, 60000);

  it('EZD-007d T26 part d password still refused after the code sign-in', async () => {
    const p = await createTestMember({ tenantId: tenantA, status: 'active' });
    const password = randomUUID().replace(/-/g, '').slice(0, 20);
    const anon = createClient(url(), publishable(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await anon.auth.signUp({ email: p.email, password });
    lastSend.set(p.email, Date.now());
    await sleep(1100);
    const row = await harnessSql()`
      select email_confirmed_at, encrypted_password from auth.users where email = ${p.email}`;
    expect(row.length).toBe(1);
    expect(row[0].email_confirmed_at).toBeNull();
    expect(row[0].encrypted_password).toBeNull();

    expect(await signInByCode(newStore(), p.email)).toEqual({ redirect: '/' });
    const { data, error } = await anon.auth.signInWithPassword({ email: p.email, password });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  }, 60000);

  it('EZD-007d T36 completeSignIn with a stub client', async () => {
    const row = (over: Record<string, unknown>) => ({
      app_user_id: 'u',
      has_access: true,
      accepted_membership_id: null,
      accepted_tenant_id: null,
      ...over,
    });

    // (a) no row, (b) no access
    for (const data of [[], [row({ has_access: false })]]) {
      emitMock.mockClear();
      const { client, calls } = stubClient({ rpc: { data, error: null } });
      await expect(completeSignIn(client)).resolves.toBe('no_access');
      expect(calls.rpc[0]?.[0]).toBe('link_app_user');
      expect(calls.signOut).toEqual([[{ scope: 'local' }]]);
      expect(calls.refresh).toBe(0);
      expect(emitMock).not.toHaveBeenCalled();
    }

    // (c) RPC error
    emitMock.mockClear();
    const c = stubClient({ rpc: { data: null, error: { message: 'x' } } });
    const cOut = await settle(completeSignIn(c.client));
    expect(cOut.ok).toBe(false);
    expect((cOut as { reason: Error }).reason).toBeInstanceOf(Error);
    expect((cOut as { reason: Error }).reason.message).toBe('link_app_user_failed');
    expect(c.calls.signOut).toEqual([[{ scope: 'local' }]]);
    expect(emitMock).not.toHaveBeenCalled();
    expect(c.calls.refresh).toBe(0);

    // (d) accepted invite, emit rejects
    const accepted = row({ accepted_membership_id: 'm', accepted_tenant_id: 't' });
    emitMock.mockClear();
    emitMock.mockRejectedValueOnce(new Error('sink down'));
    const d = stubClient({ rpc: { data: [accepted], error: null } });
    await expect(completeSignIn(d.client)).resolves.toBe('ok');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'user.joined',
      { membershipId: 'm', appUserId: 'u', via: 'sign_in' },
      { tenantId: 't', actorId: 'u' },
    );
    expect(d.calls.refresh).toBe(1);
    expect(d.calls.signOut).toEqual([]);

    // (e) refresh error
    emitMock.mockClear();
    const e = stubClient({
      rpc: { data: [accepted], error: null },
      refresh: { error: { message: 'x' } },
    });
    const eOut = await settle(completeSignIn(e.client));
    expect(eOut.ok).toBe(false);
    expect((eOut as { reason: Error }).reason).toBeInstanceOf(Error);
    expect((eOut as { reason: Error }).reason.message).toBe('session_refresh_failed');
    expect(e.calls.signOut).toEqual([[{ scope: 'local' }]]);

    // (f) access, nothing accepted
    emitMock.mockClear();
    const f = stubClient({ rpc: { data: [row({})], error: null } });
    await expect(completeSignIn(f.client)).resolves.toBe('ok');
    expect(emitMock).not.toHaveBeenCalled();
    expect(f.calls.refresh).toBe(1);
  });

  it('EZD-007d T27 action refuse rules', async () => {
    const requests: string[] = [];
    const realFetch = globalThis.fetch;
    const stubs = new Map<string, () => Response>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new Request(input as RequestInfo | URL, init as RequestInit | undefined);
      requests.push(req.url);
      for (const [prefix, answer] of stubs) if (req.url.startsWith(prefix)) return answer();
      return realFetch(input, init);
    });
    const verifyPrefix = () => `${url()}/auth/v1/verify`;
    const countFrom = (mark: number, prefix: string) =>
      requests.slice(mark).filter((r) => r.startsWith(prefix)).length;
    const rateLimited = (body: Record<string, unknown>) => () =>
      new Response(JSON.stringify(body), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });

    try {
      // (a) wrong code
      const member = await createTestMember({ tenantId: tenantA, status: 'active' });
      const storeA = newStore();
      const { result, before } = await request(storeA, member.email);
      expect(result).toEqual({ step: 'code' });
      const { code } = await waitForAuthEmail(member.email, { after: before });
      const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
      expect(await run(storeA, () => verifySignInCode(form({ code: wrong })))).toEqual({
        resolved: { error: 'code_invalid' },
      });
      expect(storeA.map.get(SIGN_IN_EMAIL) ?? '').not.toBe('');

      // (b) malformed codes: no Auth call
      let mark = requests.length;
      for (const bad of ['12345', 'abcdef']) {
        expect(
          await run(newStore(), () => verifySignInCode(form({ email: member.email, code: bad }))),
        ).toEqual({ resolved: { error: 'code_invalid' } });
      }
      expect(countFrom(mark, verifyPrefix())).toBe(0);

      // (c) no email anywhere
      mark = requests.length;
      expect(
        await run(newStore(), () => verifySignInCode(form({ email: '', code: '123456' }))),
      ).toEqual({ resolved: { error: 'code_invalid' } });
      expect(countFrom(mark, verifyPrefix())).toBe(0);

      // (d) malformed email
      mark = requests.length;
      const storeD = newStore();
      expect(await run(storeD, () => requestSignIn(form({ email: 'not-an-email' })))).toEqual({
        resolved: { error: 'invalid_email' },
      });
      expect(countFrom(mark, `${url()}/auth/v1/`)).toBe(0);
      expect(writesOf(storeD, SIGN_IN_EMAIL)).toEqual([]);
      expect(await countAuthEmails('not-an-email')).toBe(0);

      // (e) link of another type
      mark = requests.length;
      expect(
        await run(newStore(), () =>
          confirmSignInLink(form({ token_hash: 'x', type: 'magiclink' })),
        ),
      ).toEqual({ resolved: { error: 'link_invalid' } });
      expect(countFrom(mark, verifyPrefix())).toBe(0);

      // (f) per-IP limit
      const fm = await createTestMember({ tenantId: tenantA, status: 'active' });
      stubs.set(
        `${url()}/auth/v1/otp`,
        rateLimited({ error_code: 'over_request_rate_limit', msg: 'x' }),
      );
      const storeF = newStore();
      expect(await run(storeF, () => requestSignIn(form({ email: fm.email })))).toEqual({
        resolved: { error: 'too_many_requests' },
      });
      expect(writesOf(storeF, SIGN_IN_EMAIL)).toEqual([]);

      // (i) per-address limit stays hidden
      const im = await createTestMember({ tenantId: tenantA, status: 'active' });
      stubs.set(
        `${url()}/auth/v1/otp`,
        rateLimited({ error_code: 'over_email_send_rate_limit', msg: 'x' }),
      );
      const storeI = newStore();
      expect(await run(storeI, () => requestSignIn(form({ email: im.email })))).toEqual({
        resolved: { step: 'code' },
      });
      expect(storeI.map.get(SIGN_IN_EMAIL)).toBe(im.email.trim().toLowerCase());
      stubs.clear();

      // (g) unknown language
      const storeG = newStore();
      await run(storeG, () => setSignInLanguage(form({ lang: 'fr' })));
      expect(storeG.map.get('ezd_sign_in_lang')).toBe('en');

      // (h) 429 from verifyOtp
      stubs.set(verifyPrefix(), rateLimited({ msg: 'x' }));
      const storeH = newStore([[SIGN_IN_EMAIL, member.email]]);
      expect(await run(storeH, () => verifySignInCode(form({ code: '123456' })))).toEqual({
        resolved: { error: 'too_many_requests' },
      });
      expect(
        await run(storeH, () => confirmSignInLink(form({ token_hash: 'x', type: 'email' }))),
      ).toEqual({ resolved: { error: 'too_many_requests' } });
      expect(storeH.map.get(SIGN_IN_EMAIL)).toBe(member.email);
      expect(writesOf(storeH, SIGN_IN_EMAIL).filter((w) => w.deleted)).toEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  }, 60000);
});
