// EZD-108 T7 and T8 (vault/plans/EZD-108.md sections 3, 4 and Decided "changePassword", "setPassword",
// "Password email"; AC-EZD-108-5, -6, -8): POST /api/profile/password on the local stack. next/headers is
// mocked and members sign in with a cookie store each, as in app/src/app/api/settings/customers/route.test.ts
// (password members through signInWithPassword and completeSignIn). Expected values: error bodies
// `{ error: { code, message_key: 'error.<code>' } }`; Q-0094 (5 wrong current passwords per 15 minutes);
// the plan's probe (a session older than 24 h needs the reauthentication code); email subjects from the
// plan's section 6. Secrets are compared only as sign-in booleans (L-018). Emails: the stub outbox for the
// app's own mail, the local mail catcher for Auth's code mail (CLAUDE.md rule 6).
import { createClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestMembers,
  createPasswordMember,
  randomPassword,
} from '../../../../../test-harness/auth-users';
import { countAuthEmails, waitForRawEmail } from '../../../../../test-harness/mail-catcher';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  sessionCount,
} from '../../../../../test-harness/rls/fixtures';
import { completeSignIn } from '../../../../server/auth/complete-sign-in';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
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

async function codeOnlyCookies(email: string): Promise<Map<string, string>> {
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

async function passwordCookies(email: string, password: string): Promise<Map<string, string>> {
  const store = new Map<string, string>();
  const client = createSessionClient(jarOver(store));
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInWithPassword failed: ${error.code}`);
  expect(await completeSignIn(client)).toBe('ok');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}

async function canSignIn(email: string, password: string): Promise<boolean> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return error === null && data.session !== null;
}

const err = (code: string) => ({ error: { code, message_key: `error.${code}` } });
const NOT_SIGNED_IN = err('not_signed_in');
const CHANGED_SUBJECT = 'Your EZ Draft password was changed';
const SET_SUBJECT = 'A password was set for your EZ Draft account';
const mailTo = (email: string) => readStubOutbox().filter((m) => m.to.toLowerCase() === email);

async function post(body: unknown): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/profile/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // keep the text
  }
  return { res, json };
}

const change = (currentPassword: string, newPassword: string, confirmPassword = newPassword) =>
  post({ mode: 'change', currentPassword, newPassword, confirmPassword });
const setPw = (newPassword: string, code?: string, confirmPassword = newPassword) =>
  post({ mode: 'set', newPassword, confirmPassword, ...(code === undefined ? {} : { code }) });

describe('EZD-108 password route', () => {
  let tenant = '';

  beforeAll(async () => {
    tenant = await createTenant();
  }, 60000);

  beforeEach(() => {
    clearStubOutbox();
  });

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  it('T7 change password: refusals first, a wrong-password throttle, then done with one email', async () => {
    const a = await createPasswordMember({ tenantId: tenant });
    const b = await createPasswordMember({ tenantId: tenant });
    const aCookies = await passwordCookies(a.email, a.password);
    const bCookies = await passwordCookies(b.email, b.password);
    const fresh = await randomPassword(a.email);

    state.store = new Map();
    const anon = await change(a.password, fresh);
    expect(anon.res.status).toBe(401);
    expect(anon.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(aCookies);
    const notJson = await post('{not json');
    expect(notJson.res.status).toBe(400);
    expect(notJson.json).toEqual(err('invalid_input'));

    // A: new passwords differ
    const sessionsBefore = await sessionCount(a.authUserId);
    const mismatch = await change(a.password, fresh, `${fresh}x`);
    expect(await sessionCount(a.authUserId)).toBe(sessionsBefore);
    expect(mismatch.res.status).toBe(400);
    expect(mismatch.json).toEqual(err('password_mismatch'));
    expect(mailTo(a.email)).toHaveLength(0);
    expect(await canSignIn(a.email, a.password)).toBe(true);

    // A: wrong current password
    const wrong = await change(`${a.password}x`, fresh);
    expect(wrong.res.status).toBe(400);
    expect(wrong.res.headers.get('Cache-Control')).toBe('no-store');
    expect(wrong.json).toEqual(err('current_password_wrong'));
    expect(await canSignIn(a.email, a.password)).toBe(true);
    expect(await canSignIn(a.email, fresh)).toBe(false);
    expect(mailTo(a.email)).toHaveLength(0);

    // B: five wrong current passwords, then the right one is throttled
    state.store = new Map(bCookies);
    const newForB = await randomPassword(b.email);
    for (let i = 0; i < 5; i++) {
      const r = await change(`${b.password}x${i}`, newForB);
      expect(r.res.status, `wrong attempt ${i + 1}`).toBe(400);
      expect(r.json).toEqual(err('current_password_wrong'));
    }
    const sixth = await change(b.password, newForB);
    expect(sixth.res.status).toBe(429);
    expect(sixth.json).toEqual(err('current_password_throttled'));
    expect(await canSignIn(b.email, b.password)).toBe(true);
    expect(await canSignIn(b.email, newForB)).toBe(false);
    expect(mailTo(b.email)).toHaveLength(0);

    // A: the same password as the current one
    state.store = new Map(aCookies);
    const same = await change(a.password, a.password);
    expect(same.res.status).toBe(400);
    expect(same.json).toEqual(err('password_same'));
    expect(await canSignIn(a.email, a.password)).toBe(true);
    expect(mailTo(a.email)).toHaveLength(0);

    // A: done
    const done = await change(a.password, fresh);
    expect(done.res.status).toBe(200);
    expect(done.json).toEqual({ status: 'done' });
    expect(await canSignIn(a.email, fresh)).toBe(true);
    expect(await canSignIn(a.email, a.password)).toBe(false);
    const sent = mailTo(a.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(CHANGED_SUBJECT);
  }, 120000);

  it('T8 set password: a fresh session sets it; an old session needs the emailed code; a member with a password is refused', async () => {
    // fresh session
    const first = await createMember({ tenantId: tenant, scope: 'all' });
    const firstCookies = await codeOnlyCookies(first.email);
    const firstPassword = await randomPassword(first.email);
    state.store = new Map(firstCookies);
    const done = await setPw(firstPassword);
    expect(done.res.status).toBe(200);
    expect(done.json).toEqual({ status: 'done' });
    const sent = mailTo(first.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(SET_SUBJECT);
    expect(await canSignIn(first.email, firstPassword)).toBe(true);

    // a session created 25 hours ago
    clearStubOutbox();
    const aged = await createMember({ tenantId: tenant, scope: 'all' });
    const agedCookies = await codeOnlyCookies(aged.email);
    await harnessSql()`
      update auth.sessions set created_at = now() - interval '25 hours'
      where user_id = ${aged.authUserId}::uuid`;
    const agedPassword = await randomPassword(aged.email);
    const startedAt = new Date(Date.now() - 1000);
    state.store = new Map(agedCookies);
    const needsCode = await setPw(agedPassword);
    expect(needsCode.res.status).toBe(200);
    expect(needsCode.json).toEqual({ status: 'code_sent' });
    expect(await countAuthEmails(aged.email, { after: startedAt })).toBe(1);
    expect(mailTo(aged.email)).toHaveLength(0);
    expect(await canSignIn(aged.email, agedPassword)).toBe(false);

    const badCode = await setPw(agedPassword, '000000');
    expect(badCode.res.status).toBe(400);
    expect(badCode.json).toEqual(err('code_invalid'));
    expect(await canSignIn(aged.email, agedPassword)).toBe(false);

    const mail = await waitForRawEmail(aged.email, { after: startedAt });
    const codes = new Set(mail.text.match(/(?<!\d)\d{6}(?!\d)/g) ?? []);
    expect(codes.size).toBe(1);
    const [code] = [...codes];
    const accepted = await setPw(agedPassword, code);
    expect(accepted.res.status).toBe(200);
    expect(accepted.json).toEqual({ status: 'done' });
    expect(await canSignIn(aged.email, agedPassword)).toBe(true);
    const agedSent = mailTo(aged.email);
    expect(agedSent).toHaveLength(1);
    expect(agedSent[0].subject).toBe(SET_SUBJECT);

    // a member who already has a password cannot use set
    const has = await createPasswordMember({ tenantId: tenant });
    state.store = new Map(await passwordCookies(has.email, has.password));
    const refused = await setPw(await randomPassword(has.email));
    expect(refused.res.status).toBe(400);
    expect(refused.json).toEqual(err('invalid_input'));
    expect(await canSignIn(has.email, has.password)).toBe(true);
  }, 120000);
});
