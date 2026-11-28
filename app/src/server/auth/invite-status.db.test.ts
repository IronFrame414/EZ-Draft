// EZD-2021 database tests (audit 2026-11-27 X4; AC-EZD-2021-1, AC-EZD-2021-3): invite_status, which the /invite/<token>
// page reads on GET, adds codeLocked to its live answer, so the invitee who follows the emailed link still sees
// that the invite code is locked while acceptInviteCode answers invite_code_invalid to everyone. Expected
// values: invite table check (code_tries 0..5) and migration 20261113170000 (five wrong codes lock the code
// until Resend, which sets code_tries = 0): codeLocked false at 0 and 4 tries, true at 5, false again after
// Resend; a link that does not work (unknown, cancelled, accepted, expired) still answers exactly
// { live: false }; the function stays service_role only. No policy changes in this ticket; a member of another
// company still cannot read or change the invite (the invite functions answer P0002 to them).
import { createHash, randomBytes } from 'node:crypto';
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
import { addUser, hex8, roleId } from '../../../test-harness/users/fixtures';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const sha = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
const fresh = () => {
  const token = randomBytes(32).toString('base64url');
  return { secret: randomBytes(32).toString('hex'), token, hash: sha(token) };
};

const status = (hash: string) =>
  adminDb().rpc('invite_status', { p_token_sha256: hash }) as unknown as Promise<RpcResult>;

async function invite(s: Session, tenant: string): Promise<{ membershipId: string; hash: string }> {
  const f = fresh();
  const r = (await s.serverDb.rpc('create_invite', {
    p_email: `ezd2021-${hex8()}-${hex8()}@example.com`,
    p_name: null,
    p_role_id: await roleId(tenant, 'crew'),
    p_language: 'en',
    p_scope: null,
    p_secret: f.secret,
    p_token_sha256: f.hash,
  })) as unknown as RpcResult;
  expect(r.error).toBeNull();
  return { membershipId: (r.data as { membershipId: string }).membershipId, hash: f.hash };
}

const setTries = (membershipId: string, tries: number) =>
  harnessSql()`update public.invite set code_tries = ${tries} where membership_id = ${membershipId}::uuid`;

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-2021 invite_status codeLocked', () => {
  it('S1 codeLocked is false at 0 and 4 wrong codes, true at 5, and false again after Resend', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);
    const { membershipId, hash } = await invite(so, t);
    const [company] = await harnessSql()<{ name: string }[]>`select name from public.tenant where id = ${t}::uuid`;

    expect((await status(hash)).data).toEqual({ live: true, companyName: company.name, codeLocked: false });
    await setTries(membershipId, 4);
    expect((await status(hash)).data).toEqual({ live: true, companyName: company.name, codeLocked: false });
    await setTries(membershipId, 5);
    expect((await status(hash)).data).toEqual({ live: true, companyName: company.name, codeLocked: true });

    const next = fresh();
    const r = (await so.serverDb.rpc('resend_invite', {
      p_membership_id: membershipId,
      p_secret: next.secret,
      p_token_sha256: next.hash,
    })) as unknown as RpcResult;
    expect(r.error).toBeNull();
    expect((await status(next.hash)).data).toEqual({
      live: true,
      companyName: company.name,
      codeLocked: false,
    });
    // The old link no longer works and says nothing more.
    expect((await status(hash)).data).toEqual({ live: false });
  }, 60000);

  it('S2 a link that does not work answers only { live: false }, locked or not', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);

    expect((await status(fresh().hash)).data).toEqual({ live: false });

    const cancelled = await invite(so, t);
    await setTries(cancelled.membershipId, 5);
    const c = (await so.serverDb.rpc('cancel_invite', {
      p_membership_id: cancelled.membershipId,
    })) as unknown as RpcResult;
    expect(c.error).toBeNull();
    expect((await status(cancelled.hash)).data).toEqual({ live: false });

    const expired = await invite(so, t);
    await setTries(expired.membershipId, 5);
    await harnessSql()`update public.invite set expires_at = now() - interval '1 minute'
      where membership_id = ${expired.membershipId}::uuid`;
    expect((await status(expired.hash)).data).toEqual({ live: false });

    const accepted = await invite(so, t);
    await setTries(accepted.membershipId, 5);
    const a = (await adminDb().rpc('accept_invite', { p_token_sha256: accepted.hash })) as unknown as RpcResult;
    expect(a.error).toBeNull();
    expect((a.data as { status: string }).status).toBe('accepted');
    expect((await status(accepted.hash)).data).toEqual({ live: false });
  }, 60000);

  it('S3 invite_status stays service_role only: a member, a member of another company and anon are refused', async () => {
    const t = await createTenant();
    const owner = await addUser(t, { preset: 'owner', name: 'Owner' });
    const so = await signIn(owner.email);
    const { membershipId, hash } = await invite(so, t);
    await setTries(membershipId, 5);

    const other = await createTenant();
    const stranger = await addUser(other, { preset: 'owner', name: 'Stranger Owner' });
    const ss = await signIn(stranger.email);
    for (const client of [so.serverDb, ss.serverDb, anonDb({ gate: true })]) {
      const r = (await client.rpc('invite_status', { p_token_sha256: hash })) as unknown as RpcResult;
      expect(r.error).not.toBeNull();
      expect(r.data).toBeNull();
    }
    // The other company's owner cannot reach the invite through the member functions either (rule 4).
    const c = (await ss.serverDb.rpc('cancel_invite', { p_membership_id: membershipId })) as unknown as RpcResult;
    expect(c.error?.code).toBe('P0002');
    const [row] = await harnessSql()<{ code_tries: number; cancelled_at: Date | null }[]>`
      select code_tries, cancelled_at from public.invite where membership_id = ${membershipId}::uuid`;
    expect(row).toEqual({ code_tries: 5, cancelled_at: null });
  }, 60000);
});
