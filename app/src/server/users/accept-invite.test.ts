// EZD-105 accept step (AC-EZD-105-4, -7, -8; Q-0695 decisions 10 row 61; Q-0043): acceptInviteByToken against the
// local stack. next/headers is mocked so the session cookies land in a map, as in
// app/src/app/api/settings/users/[id]/route.test.ts; emit is a spy. Expected: the invite is accepted in one
// database step and only then is a session made, for an email with no auth user yet too; the session carries
// the company; user.joined is emitted with via invite_link; a used, cancelled, expired, unknown or malformed
// link answers 'refused' and leaves no session.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, hex8, roleId } from '../../../test-harness/users/fixtures';
import { createSessionClient } from '../auth/supabase-server';
import { inviteToken, inviteTokenHash, newInviteSecret } from './invite-token';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  emitted: [] as { name: string; payload: unknown; ctx: unknown }[],
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
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));

vi.mock('../events', () => ({
  emit: vi.fn(async (name: string, payload: unknown, ctx: unknown) => {
    state.emitted.push({ name, payload, ctx });
  }),
}));

type Made = { membershipId: string; appUserId: string; token: string };

describe('EZD-105 acceptInviteByToken', () => {
  let t: string;
  let so: Session;
  let crew: string;

  const invite = async (): Promise<Made> => {
    const secret = newInviteSecret();
    const token = inviteToken(secret);
    const { data, error } = await so.serverDb.rpc('create_invite', {
      p_email: `ezd105-accept-${hex8()}@example.com`,
      p_name: 'New Person',
      p_role_id: crew,
      p_language: 'en',
      p_scope: null,
      p_secret: secret,
      p_token_sha256: inviteTokenHash(token),
    });
    if (error) throw new Error(error.message);
    const v = data as { membershipId: string; appUserId: string };
    return { ...v, token };
  };

  beforeAll(async () => {
    t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Accept Owner' });
    so = await signIn(owner.email);
    crew = await roleId(t, 'crew');
  }, 120000);

  afterEach(() => {
    state.store = new Map();
    state.emitted = [];
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('A1 Accept on a new email: accepted, then signed in to the company; user.joined via invite_link', async () => {
    const m = await invite();
    const { acceptInviteByToken } = await import('./accept-invite');
    expect(await acceptInviteByToken(m.token)).toBe('accepted');
    const [row] = await harnessSql()<{ status: string; accepted: boolean; auth: string | null }[]>`
      select m.status, i.accepted_at is not null as accepted, u.auth_user_id as auth
      from public.membership m join public.invite i on i.membership_id = m.id
      join public.app_user u on u.id = m.user_id where m.id = ${m.membershipId}::uuid`;
    expect(row.status).toBe('active');
    expect(row.accepted).toBe(true);
    expect(row.auth).not.toBeNull();
    // The session in this request's cookies is the invitee's, with the company claim.
    expect(state.store.size).toBeGreaterThan(0);
    const client = createSessionClient();
    const { data: me } = await client.rpc('current_app_user_id');
    expect(me).toBe(m.appUserId);
    const { data: claims } = await client.auth.getClaims();
    expect(claims?.claims.tenant_id).toBe(t);
    expect(state.emitted).toEqual([
      {
        name: 'user.joined',
        payload: { membershipId: m.membershipId, appUserId: m.appUserId, via: 'invite_link' },
        ctx: { tenantId: t, actorId: m.appUserId },
      },
    ]);
    // The event_log row is the accept transaction's, with the request IP.
    const rows = await harnessSql()<{ ip: string | null }[]>`
      select host(ip) as ip from public.event_log
      where object_id = ${m.membershipId}::uuid and action = 'user.joined'`;
    expect(rows).toEqual([{ ip: '203.0.113.7' }]);

    // Used: refused, no new session.
    state.store = new Map();
    state.emitted = [];
    expect(await acceptInviteByToken(m.token)).toBe('refused');
    expect(state.store.size).toBe(0);
    expect(state.emitted).toEqual([]);
  }, 60000);

  it('A2 a cancelled, expired, unknown or malformed link is refused with no session', async () => {
    const { acceptInviteByToken } = await import('./accept-invite');
    const cancelled = await invite();
    await so.serverDb.rpc('cancel_invite', { p_membership_id: cancelled.membershipId });
    const expired = await invite();
    await harnessSql()`update public.membership set invited_at = now() - interval '7 days 1 minute'
      where id = ${expired.membershipId}::uuid`;
    await harnessSql()`update public.invite set expires_at = now() - interval '1 minute'
      where membership_id = ${expired.membershipId}::uuid`;
    for (const token of [
      cancelled.token,
      expired.token,
      inviteToken(newInviteSecret()),
      'not-a-token',
      '',
    ]) {
      expect(await acceptInviteByToken(token), token).toBe('refused');
      expect(state.store.size, token).toBe(0);
    }
    const [row] = await harnessSql()<{ status: string }[]>`
      select status from public.membership where id = ${expired.membershipId}::uuid`;
    expect(row.status).toBe('invited');
    expect(state.emitted).toEqual([]);
  }, 60000);

  it('A3 Accept for a person who already has a sign-in account (removed from another company earlier)', async () => {
    const { acceptInviteByToken } = await import('./accept-invite');
    const before = await createTenant();
    const person = await addUser(before, { preset: 'crew', name: 'Returning' });
    await harnessSql()`delete from public.membership where id = ${person.membershipId}::uuid`;
    const secret = newInviteSecret();
    const token = inviteToken(secret);
    const { data, error } = await so.serverDb.rpc('create_invite', {
      p_email: person.email,
      p_name: null,
      p_role_id: crew,
      p_language: 'en',
      p_scope: null,
      p_secret: secret,
      p_token_sha256: inviteTokenHash(token),
    });
    expect(error).toBeNull();
    expect((data as { appUserId: string }).appUserId).toBe(person.appUserId);
    expect(await acceptInviteByToken(token)).toBe('accepted');
    const { data: me } = await createSessionClient().rpc('current_app_user_id');
    expect(me).toBe(person.appUserId);
  }, 60000);
});
