// EZD-138 acceptInviteCode (AC-EZD-138-2, -4; Q-0695 decisions 10 row 61; 09n "Invite code tries" rows 1-4;
// board S15j W9, W10) against the local stack. next/headers is mocked as in accept-invite.test.ts (cookies in a
// map, x-forwarded-for set per test so the per-IP count is the test's own); emit is a spy. redirect is not
// mocked: a success is a rejection whose digest names the target. Expected values: the invite is accepted and
// the person is signed in to the company, landing on /; the same code then refuses (single use); unknown email,
// no invite and wrong code get the one same answer; 4 wrong then right is accepted; 5 wrong lock the code
// (W10) until Resend while the link still works; 30 failed tries from one address refuse with ip_throttled
// (architecture "Password sign-in (EZD-033)": 30 per IP in 15 minutes).
import { randomInt } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { insertThrottleRows } from '../../../test-harness/throttle';
import { addUser, hex8, roleId } from '../../../test-harness/users/fixtures';
import { createSessionClient } from './supabase-server';
import { throttleKey } from './throttle';
import { inviteCode, inviteToken, inviteTokenHash, newInviteSecret } from '../users/invite-token';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  ip: '203.0.113.1',
  emitted: [] as { name: string; payload: unknown }[],
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.store.has(name) ? { name, value: state.store.get(name) } : undefined,
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
    delete: (name: string) => state.store.delete(name),
  }),
  headers: async () => new Headers({ 'x-forwarded-for': state.ip }),
}));

vi.mock('../events', () => ({
  emit: vi.fn(async (name: string, payload: unknown) => {
    state.emitted.push({ name, payload });
  }),
}));

type Made = { membershipId: string; appUserId: string; email: string; secret: string };
type Outcome = { redirect: string } | { error: string };

function form(email: string, code: string): FormData {
  const f = new FormData();
  f.set('email', email);
  f.set('code', code);
  return f;
}

async function submit(email: string, code: string): Promise<Outcome> {
  const { acceptInviteCode } = await import('./actions');
  try {
    return await acceptInviteCode(form(email, code));
  } catch (e) {
    const digest = (e as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      return { redirect: digest.split(';').slice(2, -2).join(';') };
    }
    throw e;
  }
}

// A six-digit code that is not the invite's.
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const freshIp = () => `198.51.${randomInt(0, 256)}.${randomInt(1, 255)}`;

async function statusOf(membershipId: string) {
  const [row] = await harnessSql()<{ status: string; accepted: boolean; tries: number }[]>`
    select m.status, i.accepted_at is not null as accepted, i.code_tries as tries
    from public.membership m join public.invite i on i.membership_id = m.id
    where m.id = ${membershipId}::uuid`;
  return row;
}

describe('EZD-138 acceptInviteCode', () => {
  let t: string;
  let so: Session;
  let crew: string;

  const invite = async (email = `ezd138-code-${hex8()}@example.com`): Promise<Made> => {
    const secret = newInviteSecret();
    const { data, error } = await so.serverDb.rpc('create_invite', {
      p_email: email,
      p_name: 'Code Person',
      p_role_id: crew,
      p_language: 'en',
      p_scope: null,
      p_secret: secret,
      p_token_sha256: inviteTokenHash(inviteToken(secret)),
    });
    if (error) throw new Error(error.message);
    return { ...(data as { membershipId: string; appUserId: string }), email, secret };
  };

  beforeAll(async () => {
    t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Code Owner' });
    so = await signIn(owner.email);
    crew = await roleId(t, 'crew');
  }, 120000);

  afterEach(() => {
    state.store = new Map();
    state.emitted = [];
    state.ip = freshIp();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('C1 AC-2: email and code (typed as "482 913", any case) accept the invite and land on / signed in; the code then refuses', async () => {
    state.ip = freshIp();
    const m = await invite();
    const code = inviteCode(m.secret);
    const typed = ` ${code.slice(0, 3)} ${code.slice(3)} `;
    expect(await submit(m.email.toUpperCase(), typed)).toEqual({ redirect: '/' });
    expect(await statusOf(m.membershipId)).toMatchObject({ status: 'active', accepted: true });
    const client = createSessionClient();
    expect((await client.rpc('current_app_user_id')).data).toBe(m.appUserId);
    expect((await client.auth.getClaims()).data?.claims.tenant_id).toBe(t);
    expect(state.emitted).toEqual([
      {
        name: 'user.joined',
        payload: { membershipId: m.membershipId, appUserId: m.appUserId, via: 'invite_link' },
      },
    ]);

    // Single use (09n row 4): the same code again gets the one answer and makes no session.
    state.store = new Map();
    expect(await submit(m.email, code)).toEqual({ error: 'invite_code_invalid' });
    expect(state.store.size).toBe(0);
  }, 60000);

  it('C2 AC-4: an unknown email, an email with no invite and a wrong code all get the same one answer', async () => {
    const m = await invite();
    const code = inviteCode(m.secret);
    const member = await addUser(t, { preset: 'crew', name: 'No Invite' });
    const answers = [
      await submit(`ezd138-nobody-${hex8()}@example.com`, code),
      await submit(member.email, code),
      await submit(m.email, wrong(code)),
      // Not a six-digit code, or not an email: the same answer, nothing asked of the database.
      await submit(m.email, '12345'),
      await submit(m.email, '1234567'),
      await submit(m.email, '12a456'),
      await submit(m.email, '１２３４５６'),
      await submit('not-an-email', code),
    ];
    for (const a of answers) expect(a).toEqual({ error: 'invite_code_invalid' });
    expect(state.store.size).toBe(0);
    expect(await statusOf(m.membershipId)).toMatchObject({ status: 'invited', tries: 1 });
  }, 60000);

  it('C3 09n row 1: four wrong codes, then the right one, is accepted', async () => {
    const m = await invite();
    const code = inviteCode(m.secret);
    for (let i = 0; i < 4; i += 1) {
      expect(await submit(m.email, wrong(code))).toEqual({ error: 'invite_code_invalid' });
    }
    expect(await submit(m.email, code)).toEqual({ redirect: '/' });
    expect((await statusOf(m.membershipId)).status).toBe('active');
  }, 60000);

  it('C4 09n row 2: five wrong codes lock the code (W10) until Resend; the link still works', async () => {
    const m = await invite();
    const code = inviteCode(m.secret);
    for (let i = 0; i < 4; i += 1) {
      expect(await submit(m.email, wrong(code))).toEqual({ error: 'invite_code_invalid' });
    }
    expect(await submit(m.email, wrong(code))).toEqual({ error: 'invite_code_locked' });
    expect(await submit(m.email, code)).toEqual({ error: 'invite_code_locked' });
    expect(await statusOf(m.membershipId)).toMatchObject({ status: 'invited', tries: 5 });
    expect(state.store.size).toBe(0);

    // The link still accepts.
    const { acceptInviteByToken } = await import('../users/accept-invite');
    expect(await acceptInviteByToken(inviteToken(m.secret))).toBe('accepted');
    expect((await statusOf(m.membershipId)).status).toBe('active');
  }, 60000);

  it('C5 Resend unlocks: the new code works and the old one gets the one answer', async () => {
    const m = await invite();
    const old = inviteCode(m.secret);
    await harnessSql()`update public.invite set code_tries = 5 where membership_id = ${m.membershipId}::uuid`;
    expect(await submit(m.email, old)).toEqual({ error: 'invite_code_locked' });
    const secret = newInviteSecret();
    const { error } = await so.serverDb.rpc('resend_invite', {
      p_membership_id: m.membershipId,
      p_secret: secret,
      p_token_sha256: inviteTokenHash(inviteToken(secret)),
    });
    expect(error).toBeNull();
    const fresh = inviteCode(secret);
    // Codes of two random values differ except one time in a million; skip the old-code check then.
    if (fresh !== old) {
      expect(await submit(m.email, old)).toEqual({ error: 'invite_code_invalid' });
    }
    expect(await submit(m.email, fresh)).toEqual({ redirect: '/' });
    expect((await statusOf(m.membershipId)).status).toBe('active');
  }, 60000);

  it('C6 AC-4: the sign-in per-IP limit applies (30 failed tries in 15 minutes) and nothing is tried', async () => {
    const ip = freshIp();
    state.ip = ip;
    const m = await invite();
    await insertThrottleRows('ip', throttleKey('ip', ip), 30);
    expect(await submit(m.email, inviteCode(m.secret))).toEqual({ error: 'ip_throttled' });
    expect(await statusOf(m.membershipId)).toMatchObject({ status: 'invited', tries: 0 });
  }, 60000);

  it('C7 an accept refused because the email became active in another company gets the one answer', async () => {
    const m = await invite();
    const other = await createTenant();
    await harnessSql()`insert into public.membership (tenant_id, user_id, status, scope)
      values (${other}::uuid, ${m.appUserId}::uuid, 'active', 'all')`;
    expect(await submit(m.email, inviteCode(m.secret))).toEqual({ error: 'invite_code_invalid' });
    expect((await statusOf(m.membershipId)).status).toBe('invited');
    expect(state.store.size).toBe(0);
  }, 60000);
});
