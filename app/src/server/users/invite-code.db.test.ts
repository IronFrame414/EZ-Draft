// EZD-138 database tests (AC-EZD-138-1, -4, -5; Q-0216; Q-0695 decisions 10 row 61; Q-0706; 09n "Invite expiry"
// rows 1-2 and "Invite code tries"). invite_links_for_viewer (Users page) hands a pending invite's random value
// only to the last sender and active Owner-preset members of the same company, only while the invite is live;
// invite_code_take (sign-in page) is service_role only, adds one try per take and stops at five. Writes go through
// the gated serverDb of `signIn`, as invites.db.test.ts; the invitee's function is called with adminDb().
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, hex8, PRESET_KEYS, roleId } from '../../../test-harness/users/fixtures';
import { listUsers } from './users';
import { inviteCode, inviteToken, inviteTokenHash, newInviteSecret } from './invite-token';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };
type Made = { membershipId: string; appUserId: string; email: string; secret: string };

const newEmail = () => `ezd138-${hex8()}-${hex8()}@example.com`;

async function invite(s: Session, tenant: string, email = newEmail()): Promise<Made> {
  const secret = newInviteSecret();
  const { data, error } = await s.serverDb.rpc('create_invite', {
    p_email: email,
    p_name: null as unknown as string,
    p_role_id: await roleId(tenant, 'crew'),
    p_language: 'en',
    p_scope: null as unknown as string,
    p_secret: secret,
    p_token_sha256: inviteTokenHash(inviteToken(secret)),
  });
  if (error) throw new Error(error.message);
  return { ...(data as { membershipId: string; appUserId: string }), email, secret };
}

const links = (s: Session, ids: string[]) =>
  s.serverDb.rpc('invite_links_for_viewer', {
    p_membership_ids: ids,
  }) as unknown as Promise<RpcResult>;
const secretsOf = (r: RpcResult) =>
  Object.fromEntries(
    (r.data as { membershipId: string; secret: string }[]).map((x) => [x.membershipId, x.secret]),
  );
const take = (email: string) =>
  adminDb().rpc('invite_code_take', { p_email: email }) as unknown as Promise<RpcResult>;
type Taken = { invites: { secret: string; tries: number }[]; locked: boolean };

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-138 invite link and code functions', () => {
  it('AC-1: the last sender and Owners see the random value; another Users holder, a member without the switch and another company do not', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const keys = [...PRESET_KEYS.designer, 'settings_users'] as const;
    const h1 = await addUser(t, { preset: 'designer', name: 'Sender', granted: [...keys] });
    const h2 = await addUser(t, { preset: 'designer', name: 'Other Holder', granted: [...keys] });
    const plain = await addUser(t, { preset: 'designer', name: 'No Switch' });
    const sOwner = await signIn(owner.email);
    const sSender = await signIn(h1.email);
    const sOther = await signIn(h2.email);
    const sPlain = await signIn(plain.email);
    const byOwner = await invite(sOwner, t);
    const bySender = await invite(sSender, t);
    const ids = [byOwner.membershipId, bySender.membershipId, owner.membershipId];

    const o = await links(sOwner, ids);
    expect(o.error).toBeNull();
    expect(secretsOf(o)).toEqual({
      [byOwner.membershipId]: byOwner.secret,
      [bySender.membershipId]: bySender.secret,
    });
    expect(secretsOf(await links(sSender, ids))).toEqual({
      [bySender.membershipId]: bySender.secret,
    });
    expect(secretsOf(await links(sOther, ids))).toEqual({});
    const refused = await links(sPlain, ids);
    expect(refused.error?.code).toBe('42501');

    // Another company's Owner passing these ids gets nothing (CLAUDE.md rule 4).
    const other = await createTenant();
    const stranger = await addUser(other, { preset: 'owner', name: 'Stranger' });
    const sStranger = await signIn(stranger.email);
    expect(secretsOf(await links(sStranger, ids))).toEqual({});

    // Not on the API without a session, and the id list is bounded.
    const anon = await anonDb({ gate: true }).rpc('invite_links_for_viewer', {
      p_membership_ids: ids,
    });
    expect(anon.error).not.toBeNull();
    const many = Array.from({ length: 51 }, () => crypto.randomUUID());
    expect((await links(sOwner, many)).error?.code).toBe('22023');
    expect((await links(sOwner, [])).data).toEqual([]);

    // listUsers: the link and code on the rows the viewer may see, null elsewhere; never the random value.
    const page = await listUsers(sSender.serverDb, { q: '', page: 1 });
    const row = (id: string) => page.rows.find((r) => r.membershipId === id);
    expect(row(bySender.membershipId)?.invite).toEqual({
      link: expect.stringMatching(new RegExp(`/invite/${inviteToken(bySender.secret)}$`)),
      code: inviteCode(bySender.secret),
    });
    expect(row(bySender.membershipId)?.invite?.code).toMatch(/^[0-9]{6}$/);
    expect(row(byOwner.membershipId)?.invite).toBeNull();
    expect(row(owner.membershipId)?.invite).toBeNull();
    const json = JSON.stringify(page);
    expect(json).not.toContain(bySender.secret);
    expect(json).not.toContain(byOwner.secret);
    const ownerPage = await listUsers(sOwner.serverDb, { q: '', page: 1 });
    expect(ownerPage.rows.find((r) => r.membershipId === byOwner.membershipId)?.invite?.code).toBe(
      inviteCode(byOwner.secret),
    );
    expect(
      (await listUsers(sOther.serverDb, { q: '', page: 1 })).rows.every((r) => r.invite === null),
    ).toBe(true);
  }, 180000);

  it('AC-1: an expired, accepted or cancelled invite shows nothing (Copy link included)', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);
    const live = await invite(so, t);
    const expired = await invite(so, t);
    const accepted = await invite(so, t);
    const cancelled = await invite(so, t);
    // 09n Invite expiry row 2: sent 7 days and 1 minute ago.
    await harnessSql()`update public.membership set invited_at = now() - interval '7 days 1 minute'
      where id = ${expired.membershipId}::uuid`;
    await harnessSql()`update public.invite set expires_at = now() - interval '1 minute'
      where membership_id = ${expired.membershipId}::uuid`;
    const a = await adminDb().rpc('accept_invite', {
      p_token_sha256: inviteTokenHash(inviteToken(accepted.secret)),
    });
    expect((a.data as { status: string }).status).toBe('accepted');
    expect(
      (await so.serverDb.rpc('cancel_invite', { p_membership_id: cancelled.membershipId })).error,
    ).toBeNull();

    const ids = [live, expired, accepted, cancelled].map((m) => m.membershipId);
    expect(secretsOf(await links(so, ids))).toEqual({ [live.membershipId]: live.secret });
    const copy = (id: string) =>
      so.serverDb.rpc('invite_link_secret', {
        p_membership_id: id,
      }) as unknown as Promise<RpcResult>;
    expect((await copy(live.membershipId)).error).toBeNull();
    expect((await copy(expired.membershipId)).error?.code).toBe('P0002');
  }, 120000);

  it('AC-4: invite_code_take is service_role only, adds one try per take, stops at five and says when locked', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);
    const m = await invite(so, t);

    for (const client of [so.serverDb, anonDb({ gate: true })]) {
      expect((await client.rpc('invite_code_take', { p_email: m.email })).error).not.toBeNull();
    }
    const triesOf = async () =>
      (
        await harnessSql()<{ n: number }[]>`select code_tries as n from public.invite
        where membership_id = ${m.membershipId}::uuid`
      )[0].n;
    expect(await triesOf()).toBe(0);

    // Unknown email and empty: nothing, not locked.
    expect((await take(`ezd138-none-${hex8()}@example.com`)).data).toEqual({
      invites: [],
      locked: false,
    });
    expect((await take('')).data).toEqual({ invites: [], locked: false });

    for (let i = 1; i <= 5; i += 1) {
      const r = await take(i === 3 ? m.email.toUpperCase() : m.email);
      expect(r.error).toBeNull();
      expect(r.data).toEqual({ invites: [{ secret: m.secret, tries: i }], locked: false });
    }
    expect(await triesOf()).toBe(5);
    expect((await take(m.email)).data).toEqual({ invites: [], locked: true });
    expect(await triesOf()).toBe(5);

    // An expired invite is neither offered nor reported locked.
    await harnessSql()`update public.invite set expires_at = now() - interval '1 minute'
      where membership_id = ${m.membershipId}::uuid`;
    expect((await take(m.email)).data).toEqual({ invites: [], locked: false });
  }, 120000);

  it('AC-5: the database holds the random value and the link sha-256 only, never the code or a plain hash of it', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);
    const m = await invite(so, t);
    const code = inviteCode(m.secret);
    const [row] = await harnessSql()<Record<string, unknown>[]>`
      select * from public.invite where membership_id = ${m.membershipId}::uuid`;
    expect(row.token_sha256).toBe(
      createHash('sha256').update(inviteToken(m.secret), 'utf8').digest('hex'),
    );
    const values = Object.values(row).map((v) => (v instanceof Date ? v.toISOString() : String(v)));
    const codeHashes = ['sha256', 'sha1', 'md5'].map((alg) =>
      createHash(alg).update(code).digest('hex'),
    );
    for (const v of values) {
      expect(v).not.toBe(code);
      for (const h of codeHashes) expect(v).not.toContain(h);
    }
    // Shown again: the same link and code as at send time (worked out from the same random value).
    const page = await listUsers(so.serverDb, { q: '', page: 1 });
    expect(page.rows.find((r) => r.membershipId === m.membershipId)?.invite?.code).toBe(code);
  }, 120000);
});
