// EZD-105b route tests (AC-EZD-105b-1, -2, -3) on the local stack: the real route, session client, Auth admin
// call, database functions and the stub email transport. Expected values: Q-0096 P3 (16 characters made by
// EZ Draft; a typed one is never used), P4 (Owner preset, no settings_users needed; others 403), P5 (the
// member is emailed that it was set), P7 (signed out on every device); section 6 wording; Q-0695 decisions 03
// row 33 (event_log ip is the first x-forwarded-for address, or null). 203.0.113.9 is a documentation address.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  sessionCount,
  signIn,
  type Member,
} from '../../../../../../../test-harness/rls/fixtures';
import { addUser, PRESET_KEYS } from '../../../../../../../test-harness/users/fixtures';
import { PERMISSION_KEYS } from '../../../../../../lib/permissions/catalog';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../../server/auth/supabase-server';
import {
  clearStubOutbox,
  readStubOutbox,
} from '../../../../../../server/email/test-harness/stub-transport';

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

async function canSignIn(email: string, password: string): Promise<boolean> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return error === null && data.session !== null;
}

async function post(
  id: string,
  init: { forwarded?: string; body?: string } = {},
): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.forwarded !== undefined) headers['x-forwarded-for'] = init.forwarded;
  const res = await POST(
    new Request(`http://localhost/api/settings/users/${id}/password`, {
      method: 'POST',
      headers,
      body: init.body,
    }),
    { params: Promise.resolve({ id }) },
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

const as = async (m: Member) => {
  state.store = await cookiesFor(m.email);
};

const logIps = async (membershipId: string) =>
  (
    await harnessSql()<{ ip: string | null }[]>`
      select host(ip) as ip from public.event_log
      where object_id = ${membershipId}::uuid and action = 'user.password_set' order by at, id`
  ).map((r) => r.ip);

const SUBJECT = 'A new password was set for your EZ Draft account';
const PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]{16}$/;

describe('EZD-105b POST /api/settings/users/[id]/password', () => {
  let O: Member, O3: Member, D: Member, F: Member, I: Member, S: Member, Y: Member;

  beforeAll(async () => {
    const a = await createTenant();
    const b = await createTenant();
    O = await addUser(a, { preset: 'owner', name: 'Zed Owner' });
    O3 = await addUser(a, {
      preset: 'owner',
      granted: PERMISSION_KEYS.filter((k) => k !== 'settings_users'),
    });
    D = await addUser(a, { preset: 'designer', name: 'Ann Lee' });
    F = await addUser(a, { preset: 'foreman' });
    I = await addUser(a, { preset: 'crew', status: 'invited' });
    S = await addUser(a, { preset: 'designer', granted: [...PRESET_KEYS.designer, 'settings_users'] });
    Y = await addUser(b, { preset: 'designer' });
  }, 60000);

  beforeEach(() => {
    clearStubOutbox();
    state.store = new Map();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 an Owner sets a password: made on the server, shown once, sessions ended, member emailed', async () => {
    await signIn(D.email);
    await signIn(D.email);
    expect(await sessionCount(D.authUserId)).toBeGreaterThanOrEqual(2);
    await as(O);
    const { res, json } = await post(D.membershipId, {
      forwarded: '203.0.113.9, 10.0.0.1',
      body: '{"password":"Typed-Pass-123456"}',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = json as { password: string; emailSent: boolean };
    expect(Object.keys(body).sort()).toEqual(['emailSent', 'password']);
    expect(body.emailSent).toBe(true);
    expect(body.password).toMatch(PATTERN);
    expect(await sessionCount(D.authUserId)).toBe(0);
    expect(await canSignIn(D.email, body.password)).toBe(true);
    expect(await canSignIn(D.email, 'Typed-Pass-123456')).toBe(false);
    const mail = readStubOutbox().filter((m) => m.to.toLowerCase() === D.email.toLowerCase());
    expect(mail).toHaveLength(1);
    expect(mail[0].subject).toBe(SUBJECT);
    expect(mail[0].text).toContain('Zed Owner');
    expect(mail[0].text).not.toContain(body.password);
    expect(mail[0].html).not.toContain(body.password);
    expect(await logIps(D.membershipId)).toEqual(['203.0.113.9']);
  }, 60000);

  it('R2 refusals: 401, 404, 403 and nothing changes', async () => {
    // (a) no session.
    let r = await post(D.membershipId);
    expect(r.res.status).toBe(401);
    expect((r.json as { error: { code: string } }).error.code).toBe('not_signed_in');

    // (b), (c) a malformed id, or another company's member: 404.
    await as(O);
    for (const id of ['not-a-uuid', `${randomUUID()}0`, Y.membershipId]) {
      r = await post(id);
      expect(r.res.status, id).toBe(404);
      expect(r.json).toEqual({
        error: { code: 'member_not_found', message_key: 'error.member_not_found' },
      });
    }

    // (d) an invited member.
    r = await post(I.membershipId);
    expect(r.res.status).toBe(403);
    expect(r.json).toEqual({
      error: { code: 'password_target_refused', message_key: 'error.password_target_refused' },
    });

    // (e) a settings_users holder without the Owner preset.
    await signIn(D.email);
    const before = await sessionCount(D.authUserId);
    expect(before).toBeGreaterThanOrEqual(1);
    await as(S);
    r = await post(D.membershipId);
    expect(r.res.status).toBe(403);
    expect(r.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });
    expect(await sessionCount(D.authUserId)).toBe(before);
    expect(readStubOutbox()).toHaveLength(0);

    // (f) an Owner without settings_users may; a bad forwarded header is a null ip, never a failure.
    await as(O3);
    r = await post(F.membershipId, { forwarded: 'not-an-ip' });
    expect(r.res.status).toBe(200);
    expect(await logIps(F.membershipId)).toEqual([null]);
  }, 60000);
});
