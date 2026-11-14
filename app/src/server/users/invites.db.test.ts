// EZD-105 database tests (AC-EZD-105-1, -3, -4, -5, -6, -7, -8, -9). Expected values: S15 Invite user; Q-0695
// decisions 10 rows 59 (every invite write needs settings_users), 61 (invite table, 7 days from the last send,
// lookup by the token's sha-256, one-step accept, the link shown to the last sender and Owners), 62 (Cancel
// deletes the invited membership; sessions in another company stay), 63 (the three refusals, nothing written,
// never naming the other company; deactivated offers Reactivate; Resend moves invited_at; default Project
// access); Q-0043 (one active company); Q-0029 (English default is the route's, tested there); 09n Invite
// expiry rows 1-3 and Project scope row 5; preset switch counts 09n row 2 and migration 20261024100001
// (Foreman 11 of 37). The invite writes go through the gated serverDb of `signIn` (the real API path); the
// invitee's accept_invite and invite_status are service_role only and are called with adminDb().
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  sessionCount,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, hex8, PRESET_KEYS, roleId } from '../../../test-harness/users/fixtures';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const hex64 = () => randomBytes(32).toString('hex');
const sha = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
const fresh = () => {
  const token = randomBytes(32).toString('base64url');
  return { secret: hex64(), token, hash: sha(token) };
};
const newEmail = () => `ezd105-${hex8()}-${hex8()}@example.com`;

type CreateArgs = {
  email: string;
  name?: string | null;
  roleId: string;
  language?: string;
  scope?: string | null;
  secret?: string;
  hash?: string;
};

const create = (s: Session, a: CreateArgs): Promise<RpcResult> => {
  const f = fresh();
  return s.serverDb.rpc('create_invite', {
    p_email: a.email,
    p_name: a.name ?? null,
    p_role_id: a.roleId,
    p_language: a.language ?? 'en',
    p_scope: a.scope ?? null,
    p_secret: a.secret ?? f.secret,
    p_token_sha256: a.hash ?? f.hash,
  }) as unknown as Promise<RpcResult>;
};

const resend = (s: Session, membershipId: string, secret: string, hash: string) =>
  s.serverDb.rpc('resend_invite', {
    p_membership_id: membershipId,
    p_secret: secret,
    p_token_sha256: hash,
  }) as unknown as Promise<RpcResult>;

const cancel = (s: Session, membershipId: string) =>
  s.serverDb.rpc('cancel_invite', { p_membership_id: membershipId }) as unknown as Promise<RpcResult>;

const accept = (hash: string) =>
  adminDb().rpc('accept_invite', { p_token_sha256: hash }) as unknown as Promise<RpcResult>;

const statusOfLink = (hash: string) =>
  adminDb().rpc('invite_status', { p_token_sha256: hash }) as unknown as Promise<RpcResult>;

type Counts = { app_user: number; membership: number; invite: number; event_log: number };

// Rows of this file's companies only (other test files write in parallel): their memberships, invites and
// event_log rows, and the people in them or with this file's email prefix.
const mine: string[] = [];
async function tenant(): Promise<string> {
  const t = await createTenant();
  mine.push(t);
  return t;
}

async function counts(): Promise<Counts> {
  const [r] = await harnessSql()<Counts[]>`
    select (select count(*)::int from public.app_user u where u.email like 'ezd105-%'
        or u.id in (select user_id from public.membership where tenant_id = any(${mine}::uuid[]))) as app_user,
      (select count(*)::int from public.membership where tenant_id = any(${mine}::uuid[])) as membership,
      (select count(*)::int from public.invite where tenant_id = any(${mine}::uuid[])) as invite,
      (select count(*)::int from public.event_log where tenant_id = any(${mine}::uuid[])) as event_log`;
  return r;
}

async function inviteOf(membershipId: string) {
  const rows = await harnessSql()<
    {
      secret: string;
      token_sha256: string;
      expires_at: Date;
      code_tries: number;
      accepted_at: Date | null;
      sent_by: string | null;
      created_by: string | null;
    }[]
  >`select secret, token_sha256, expires_at, code_tries, accepted_at, sent_by, created_by
    from public.invite where membership_id = ${membershipId}::uuid`;
  return rows[0] ?? null;
}

async function membershipOf(membershipId: string) {
  const rows = await harnessSql()<
    { status: string; scope: string; invited_at: Date | null; role_id: string | null; user_id: string }[]
  >`select status, scope, invited_at, role_id, user_id from public.membership where id = ${membershipId}::uuid`;
  return rows[0] ?? null;
}

async function eventsOf(membershipId: string) {
  return harnessSql()<
    { action: string; tenant_id: string; actor_app_user_id: string | null; object_type: string; details: Record<string, unknown> }[]
  >`select action, tenant_id, actor_app_user_id, object_type, details from public.event_log
    where object_id = ${membershipId}::uuid order by at, action`;
}

async function grantedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ k: string }[]>`
    select permission_key as k from public.user_permission
    where membership_id = ${membershipId}::uuid and granted order by permission_key`;
  return rows.map((r) => r.k);
}

const sorted = (keys: readonly string[]) => [...keys].sort();
const data = (r: RpcResult) => r.data as Record<string, string>;

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-105 invite table and functions', () => {
  describeTenantIsolation('invite', {
    makeRow: async (tenantId) => {
      const m = await createMember({ tenantId, scope: 'all', status: 'invited' });
      return {
        tenant_id: tenantId,
        membership_id: m.membershipId,
        secret: hex64(),
        token_sha256: hex64(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
    },
  });

  it('AC-1, AC-8: an invite makes an invited membership with the role switches, its invite and one user.invited row', async () => {
    const t = await tenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Inviting Owner' });
    const so = await signIn(owner.email);
    const email = newEmail();
    const foreman = await roleId(t, 'foreman');
    const f = fresh();
    const r = await create(so, {
      email: `  ${email.toUpperCase()} `,
      name: '  Luis Ortega ',
      roleId: foreman,
      language: 'es',
      secret: f.secret,
      hash: f.hash,
    });
    expect(r.error).toBeNull();
    const v = data(r);
    expect(v.email).toBe(email);
    expect(v.scope).toBe('listed');
    expect(v.roleId).toBe(foreman);
    expect(v.tenantId).toBe(t);
    const m = await membershipOf(v.membershipId);
    expect(m?.status).toBe('invited');
    expect(m?.scope).toBe('listed');
    expect(m?.role_id).toBe(foreman);
    expect(m?.invited_at).not.toBeNull();
    expect(await grantedOf(v.membershipId)).toEqual(sorted(PRESET_KEYS.foreman));
    expect(await grantedOf(v.membershipId)).toHaveLength(11);
    const [person] = await harnessSql()<{ email: string; name: string; language: string }[]>`
      select email, name, language from public.app_user where id = ${v.appUserId}::uuid`;
    expect(person).toEqual({ email, name: 'Luis Ortega', language: 'es' });
    const inv = await inviteOf(v.membershipId);
    expect(inv?.secret).toBe(f.secret);
    expect(inv?.token_sha256).toBe(f.hash);
    expect(inv?.code_tries).toBe(0);
    expect(inv?.sent_by).toBe(owner.appUserId);
    expect(inv?.created_by).toBe(owner.appUserId);
    // 7 days after the send (Q-0216; Q-0695 row 61).
    expect(inv!.expires_at.getTime() - m!.invited_at!.getTime()).toBe(7 * 86400000);
    const events = await eventsOf(v.membershipId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'user.invited',
      tenant_id: t,
      actor_app_user_id: owner.appUserId,
      object_type: 'membership',
    });
    expect(events[0].details).toMatchObject({ membershipId: v.membershipId, appUserId: v.appUserId });
    // The link page reads it as live.
    const st = await statusOfLink(f.hash);
    expect(st.error).toBeNull();
    expect(st.data).toMatchObject({ live: true });
  }, 120000);

  it('AC-6: Owner and Designer default to All projects; Foreman, Crew and a custom role to Listed; a chosen value wins', async () => {
    const t = await tenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Scope Owner' });
    const so = await signIn(owner.email);
    const custom = await harnessSql()<{ id: string }[]>`
      insert into public.role (tenant_id, name, preset, default_permissions)
      values (${t}::uuid, ${'Lead ' + hex8()}, null, ${['view_projects']}::text[]) returning id`;
    const cases: [string, string][] = [
      [await roleId(t, 'owner'), 'all'],
      [await roleId(t, 'designer'), 'all'],
      [await roleId(t, 'foreman'), 'listed'],
      [await roleId(t, 'crew'), 'listed'],
      [custom[0].id, 'listed'],
    ];
    for (const [rid, scope] of cases) {
      const r = await create(so, { email: newEmail(), roleId: rid });
      expect(r.error).toBeNull();
      expect((await membershipOf(data(r).membershipId))?.scope).toBe(scope);
    }
    const chosen = await create(so, { email: newEmail(), roleId: cases[0][0], scope: 'listed' });
    expect((await membershipOf(data(chosen).membershipId))?.scope).toBe('listed');
    const customGrants = await grantedOf(data(await create(so, { email: newEmail(), roleId: custom[0].id })).membershipId);
    expect(customGrants).toEqual(['view_projects']);
  }, 120000);

  it('AC-3: an invalid email, an email active or invited here, and an email active elsewhere are refused with nothing written', async () => {
    const t = await tenant();
    const otherName = `Secret Rival Co ${hex8()}`;
    const other = await tenant();
    await harnessSql()`update public.tenant set name = ${otherName} where id = ${other}::uuid`;
    const owner = await addUser(t, { preset: 'owner', name: 'Refusing Owner' });
    const active = await addUser(t, { preset: 'crew', name: 'Here Active' });
    const invited = await addUser(t, { preset: 'crew', status: 'invited', invitedAgo: '1 day' });
    const deactivated = await addUser(t, { preset: 'crew', status: 'deactivated' });
    const elsewhere = await addUser(other, { preset: 'crew', name: 'Elsewhere' });
    const so = await signIn(owner.email);
    const crew = await roleId(t, 'crew');
    const cases: [string, string, string][] = [
      ['luis.ortega@example', '22023', 'invalid_email'],
      ['', '22023', 'invalid_email'],
      [`${'a'.repeat(310)}@example.com`, '22023', 'invalid_email'],
      [active.email, 'P0001', 'already_member'],
      [active.email.toUpperCase(), 'P0001', 'already_member'],
      [invited.email, 'P0001', 'already_invited'],
      [deactivated.email, 'P0001', 'deactivated_member'],
      [elsewhere.email, 'P0001', 'email_in_use'],
    ];
    for (const [email, code, message] of cases) {
      const before = await counts();
      const r = await create(so, { email, roleId: crew });
      expect(r.error?.code, email).toBe(code);
      expect(r.error?.message, email).toBe(message);
      expect(JSON.stringify(r.error)).not.toContain(otherName);
      expect(await counts(), email).toEqual(before);
    }
    // Bad inputs: a name over 100 characters, a language, a scope, a role from another company.
    const otherRole = await roleId(other, 'crew');
    for (const bad of [
      { email: newEmail(), roleId: crew, name: 'x'.repeat(101) },
      { email: newEmail(), roleId: crew, language: 'fr' },
      { email: newEmail(), roleId: crew, scope: 'some' },
      { email: newEmail(), roleId: otherRole },
      { email: newEmail(), roleId: crew, secret: 'short' },
    ]) {
      const before = await counts();
      const r = await create(so, bad);
      expect(r.error?.message).toBe('invalid_input');
      expect(await counts()).toEqual(before);
    }
    // 100 characters is allowed.
    expect((await create(so, { email: newEmail(), roleId: crew, name: 'x'.repeat(100) })).error).toBeNull();
  }, 120000);

  it('AC-9: without settings_users every invite write is refused with 42501 and nothing written', async () => {
    const t = await tenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const designer = await addUser(t, { preset: 'designer', name: 'No Users Switch' });
    const so = await signIn(owner.email);
    const sd = await signIn(designer.email);
    const made = await create(so, { email: newEmail(), roleId: await roleId(t, 'crew') });
    const id = data(made).membershipId;
    const before = await counts();
    const f = fresh();
    const results = [
      await create(sd, { email: newEmail(), roleId: await roleId(t, 'crew') }),
      await resend(sd, id, f.secret, f.hash),
      await cancel(sd, id),
      (await sd.serverDb.rpc('invite_link_secret', { p_membership_id: id })) as unknown as RpcResult,
    ];
    for (const r of results) {
      expect(r.error?.code).toBe('42501');
      expect(r.error?.message).toBe('permission_denied');
    }
    expect(await counts()).toEqual(before);
    // Another company's owner cannot reach this company's invite (rule 4).
    const otherCo = await tenant();
    const stranger = await addUser(otherCo, { preset: 'owner', name: 'Stranger Owner' });
    const ss = await signIn(stranger.email);
    const beforeStranger = await counts();
    for (const r of [
      await resend(ss, id, f.secret, f.hash),
      await cancel(ss, id),
      (await ss.serverDb.rpc('invite_link_secret', { p_membership_id: id })) as unknown as RpcResult,
    ]) {
      expect(r.error?.code).toBe('P0002');
    }
    expect(await counts()).toEqual(beforeStranger);
    // The invitee's two functions are not on the API for a member or anonymous caller.
    const anon = anonDb({ gate: true });
    for (const client of [sd.serverDb, anon]) {
      const a = await client.rpc('accept_invite', { p_token_sha256: f.hash });
      expect(a.error).not.toBeNull();
      const s = await client.rpc('invite_status', { p_token_sha256: f.hash });
      expect(s.error).not.toBeNull();
    }
  }, 120000);

  it('AC-4: Resend moves the 7-day clock, makes a new link, resets code tries and makes the caller the sender; the old link refuses', async () => {
    const t = await tenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const holder = await addUser(t, {
      preset: 'designer',
      name: 'Users Holder',
      granted: [...PRESET_KEYS.designer, 'settings_users'],
    });
    const so = await signIn(owner.email);
    const sh = await signIn(holder.email);
    const first = fresh();
    const made = await create(so, { email: newEmail(), roleId: await roleId(t, 'crew'), secret: first.secret, hash: first.hash });
    const id = data(made).membershipId;
    // Sent on day 0; Resend on day 6 (09n Invite expiry row 3).
    await harnessSql()`update public.membership set invited_at = now() - interval '6 days' where id = ${id}::uuid`;
    await harnessSql()`update public.invite set expires_at = now() + interval '1 day', code_tries = 4 where membership_id = ${id}::uuid`;
    const second = fresh();
    const r = await resend(sh, id, second.secret, second.hash);
    expect(r.error).toBeNull();
    const m = await membershipOf(id);
    const inv = await inviteOf(id);
    expect(Date.now() - m!.invited_at!.getTime()).toBeLessThan(60000);
    expect(inv!.expires_at.getTime() - m!.invited_at!.getTime()).toBe(7 * 86400000);
    expect(inv?.token_sha256).toBe(second.hash);
    expect(inv?.secret).toBe(second.secret);
    expect(inv?.code_tries).toBe(0);
    expect(inv?.sent_by).toBe(holder.appUserId);
    expect(inv?.created_by).toBe(owner.appUserId);
    expect((await eventsOf(id)).map((e) => e.action)).toEqual(['user.invited', 'user.invite_resent']);
    // The old link no longer works; the new one does.
    expect((await statusOfLink(first.hash)).data).toEqual({ live: false });
    expect(data(await accept(first.hash)).status).toBe('refused');
    expect(data(await accept(second.hash)).status).toBe('accepted');
    // Resend on an accepted row is refused.
    const again = fresh();
    expect((await resend(so, id, again.secret, again.hash)).error?.message).toBe('member_state');
    // Unknown id.
    expect((await resend(so, crypto.randomUUID(), again.secret, again.hash)).error?.code).toBe('P0002');
  }, 120000);

  it('AC-4, AC-7: valid for 7 days from the last send (09n rows 1, 2); accept is single use and writes one user.joined row', async () => {
    const t = await tenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);
    const crew = await roleId(t, 'crew');
    const ok = fresh();
    const late = fresh();
    const a = data(await create(so, { email: newEmail(), roleId: crew, secret: ok.secret, hash: ok.hash }));
    const b = data(await create(so, { email: newEmail(), roleId: crew, secret: late.secret, hash: late.hash }));
    // Sent day 0 at 00:00: Accept on day 6 at 23:59 works, on day 7 at 00:01 it does not.
    const set = async (id: string, ago: string) => {
      await harnessSql()`update public.membership set invited_at = now() - ${ago}::interval where id = ${id}::uuid`;
      await harnessSql()`update public.invite set expires_at = now() - ${ago}::interval + interval '7 days'
        where membership_id = ${id}::uuid`;
    };
    await set(a.membershipId, '6 days 23 hours 59 minutes');
    await set(b.membershipId, '7 days 1 minute');
    expect((await statusOfLink(late.hash)).data).toEqual({ live: false });
    const refused = await accept(late.hash);
    expect(refused.data).toEqual({ status: 'refused' });
    expect((await membershipOf(b.membershipId))?.status).toBe('invited');

    const r = await accept(ok.hash);
    expect(r.error).toBeNull();
    expect(r.data).toEqual({
      status: 'accepted',
      membershipId: a.membershipId,
      appUserId: a.appUserId,
      tenantId: t,
      email: a.email,
    });
    expect((await membershipOf(a.membershipId))?.status).toBe('active');
    expect((await inviteOf(a.membershipId))?.accepted_at).not.toBeNull();
    const joined = (await eventsOf(a.membershipId)).filter((e) => e.action === 'user.joined');
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ tenant_id: t, actor_app_user_id: a.appUserId, object_type: 'membership' });
    expect(joined[0].details).toEqual({ membershipId: a.membershipId, appUserId: a.appUserId, via: 'invite_link' });
    // Single use.
    expect((await accept(ok.hash)).data).toEqual({ status: 'refused' });
    expect((await statusOfLink(ok.hash)).data).toEqual({ live: false });
    expect((await eventsOf(a.membershipId)).filter((e) => e.action === 'user.joined')).toHaveLength(1);
    // A malformed or unknown hash.
    expect((await accept('nope')).data).toEqual({ status: 'refused' });
    expect((await accept(hex64())).data).toEqual({ status: 'refused' });
  }, 120000);

  it('AC-7: accept is refused, with nothing changed, when the email became active in another company', async () => {
    const t = await tenant();
    const other = await tenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);
    const f = fresh();
    const made = data(await create(so, { email: newEmail(), roleId: await roleId(t, 'crew'), secret: f.secret, hash: f.hash }));
    await harnessSql()`insert into public.membership (tenant_id, user_id, status, scope)
      values (${other}::uuid, ${made.appUserId}::uuid, 'active', 'all')`;
    const before = await counts();
    expect((await accept(f.hash)).data).toEqual({ status: 'refused' });
    expect(await counts()).toEqual(before);
    expect((await membershipOf(made.membershipId))?.status).toBe('invited');
    expect((await inviteOf(made.membershipId))?.accepted_at).toBeNull();
  }, 120000);

  it('AC-5, AC-8: Cancel deletes the invited membership and its invite, writes user.invite_cancelled, the link refuses, and the person stays signed in elsewhere', async () => {
    const t = await tenant();
    const other = await tenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);
    // Invited here while pending; then active in another company with a live session.
    const f = fresh();
    const made = data(await create(so, { email: newEmail(), roleId: await roleId(t, 'crew'), secret: f.secret, hash: f.hash }));
    const person = await harnessSql()<{ auth_user_id: string | null }[]>`
      select auth_user_id from public.app_user where id = ${made.appUserId}::uuid`;
    expect(person[0].auth_user_id).toBeNull();
    await harnessSql()`insert into public.membership (tenant_id, user_id, status, scope)
      values (${other}::uuid, ${made.appUserId}::uuid, 'active', 'all')`;
    const { data: created } = await adminDb().auth.admin.createUser({ email: made.email, email_confirm: true });
    const authUserId = created.user!.id;
    await harnessSql()`update public.app_user set auth_user_id = ${authUserId}::uuid where id = ${made.appUserId}::uuid`;
    await signIn(made.email);
    expect(await sessionCount(authUserId)).toBe(1);

    const r = await cancel(so, made.membershipId);
    expect(r.error).toBeNull();
    expect(await membershipOf(made.membershipId)).toBeNull();
    expect(await inviteOf(made.membershipId)).toBeNull();
    expect(await sessionCount(authUserId)).toBe(1);
    expect((await accept(f.hash)).data).toEqual({ status: 'refused' });
    const events = await eventsOf(made.membershipId);
    expect(events.map((e) => e.action)).toEqual(['user.invited', 'user.invite_cancelled']);
    expect(events[1]).toMatchObject({ tenant_id: t, actor_app_user_id: owner.appUserId });
    // Only a pending invite can be cancelled; an unknown id is not found.
    expect((await cancel(so, owner.membershipId)).error?.message).toBe('member_state');
    expect((await cancel(so, made.membershipId)).error?.code).toBe('P0002');
    await harnessSql()`delete from auth.users where id = ${authUserId}::uuid`;
  }, 120000);

  it('Copy link (Q-0216, Q-0706): the last sender and Owners see it; after another holder resends, they do and the first sender does not', async () => {
    const t = await tenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const keys = [...PRESET_KEYS.designer, 'settings_users'] as const;
    const h1 = await addUser(t, { preset: 'designer', name: 'Holder One', granted: [...keys] });
    const h2 = await addUser(t, { preset: 'designer', name: 'Holder Two', granted: [...keys] });
    const [so, s1, s2] = [await signIn(owner.email), await signIn(h1.email), await signIn(h2.email)];
    const f = fresh();
    const id = data(await create(s1, { email: newEmail(), roleId: await roleId(t, 'crew'), secret: f.secret, hash: f.hash })).membershipId;
    const flag = async (s: Session) => {
      const { data: page, error } = await s.serverDb.rpc('list_users', { p_search: '', p_page: 1 });
      expect(error).toBeNull();
      const rows = (page as { rows: { membershipId: string; canCopyLink: boolean }[] }).rows;
      return rows.find((x) => x.membershipId === id)?.canCopyLink;
    };
    const secretFor = (s: Session) =>
      s.serverDb.rpc('invite_link_secret', { p_membership_id: id }) as unknown as Promise<RpcResult>;
    expect([await flag(so), await flag(s1), await flag(s2)]).toEqual([true, true, false]);
    expect(data(await secretFor(s1)).secret).toBe(f.secret);
    expect(data(await secretFor(so)).secret).toBe(f.secret);
    expect((await secretFor(s2)).error?.code).toBe('P0002');

    const g = fresh();
    expect((await resend(s2, id, g.secret, g.hash)).error).toBeNull();
    expect([await flag(so), await flag(s1), await flag(s2)]).toEqual([true, false, true]);
    expect((await secretFor(s1)).error?.code).toBe('P0002');
    expect(data(await secretFor(s2)).secret).toBe(g.secret);
  }, 180000);
});
