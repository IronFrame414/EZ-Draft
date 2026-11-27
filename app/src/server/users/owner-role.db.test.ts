// EZD-2024 database tests (AC-EZD-2024-1, AC-EZD-2024-2, AC-EZD-2024-4). Expected values: Q-0901 (Josh, "901 A"): only a caller whose
// own active membership holds the Owner-preset role may give a member the Owner-preset role or move a member
// off it, in save_member and create_invite; every other Users write keeps Q-0695 (any settings_users holder).
// The named refusal is P0001 owner_role_owner_only. A caller from another company cannot reach this company:
// another company's member is P0002 (Q-0695 row 59, EZD-106) and another company's role is 22023 invalid_input.
// Calls go through the gated serverDb of `signIn` (the real API path).
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, hex8, PRESET_KEYS, roleId } from '../../../test-harness/users/fixtures';
import type { PermissionKey } from '../../lib/permissions/catalog';

const REFUSED = 'owner_role_owner_only';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const save = (
  s: Session,
  membershipId: string,
  roleIdValue: string,
  granted: readonly string[],
  language = 'en',
): Promise<RpcResult> =>
  s.serverDb.rpc('save_member', {
    p_membership_id: membershipId,
    p_role_id: roleIdValue,
    p_language: language,
    p_granted: granted,
  }) as unknown as Promise<RpcResult>;

const invite = (s: Session, email: string, roleIdValue: string): Promise<RpcResult> => {
  const token = randomBytes(32).toString('base64url');
  return s.serverDb.rpc('create_invite', {
    p_email: email,
    p_name: null,
    p_role_id: roleIdValue,
    p_language: 'en',
    p_scope: null,
    p_secret: randomBytes(32).toString('hex'),
    p_token_sha256: createHash('sha256').update(token, 'utf8').digest('hex'),
  }) as unknown as Promise<RpcResult>;
};

const newEmail = () => `ezd2024-${hex8()}-${hex8()}@example.com`;

async function roleOf(membershipId: string): Promise<string | null> {
  const rows = await harnessSql()<{ role_id: string | null }[]>`
    select role_id from public.membership where id = ${membershipId}::uuid`;
  return rows[0]?.role_id ?? null;
}

async function grantedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ k: string }[]>`
    select permission_key as k from public.user_permission
    where membership_id = ${membershipId}::uuid and granted order by permission_key`;
  return rows.map((r) => r.k);
}

async function membershipsWithEmail(email: string): Promise<number> {
  const rows = await harnessSql()<{ n: number }[]>`
    select count(*)::int as n from public.membership m join public.app_user u on u.id = m.user_id
    where u.email = ${email}`;
  return rows[0].n;
}

async function viewerIsOwner(s: Session): Promise<unknown> {
  const r = (await s.serverDb.rpc('list_users', { p_search: '', p_page: 1 })) as unknown as RpcResult;
  expect(r.error).toBeNull();
  return (r.data as { viewerIsOwner?: unknown }).viewerIsOwner;
}

const sorted = (keys: readonly string[]) => [...keys].sort();
// A Designer who also holds the Users switch: a settings_users holder who is not an Owner (Q-0695 row 59).
const ADMIN_KEYS: PermissionKey[] = [...PRESET_KEYS.designer, 'settings_users'];

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-2024 only an Owner can give or take away the Owner role', () => {
  let t: string;
  let other: string;
  let ownerRole: string;
  let designerRole: string;
  let crewRole: string;
  let owner: Awaited<ReturnType<typeof addUser>>;
  let admin: Awaited<ReturnType<typeof addUser>>;
  let so: Session;
  let sa: Session;

  beforeAll(async () => {
    t = await createTenant();
    other = await createTenant();
    ownerRole = await roleId(t, 'owner');
    designerRole = await roleId(t, 'designer');
    crewRole = await roleId(t, 'crew');
    owner = await addUser(t, { preset: 'owner', name: 'Olga Owner' });
    admin = await addUser(t, { preset: 'designer', name: 'Adam Admin', granted: ADMIN_KEYS });
    so = await signIn(owner.email);
    sa = await signIn(admin.email);
  }, 120000);

  it('AC-EZD-2024-1, AC-EZD-2024-4: a non-Owner settings_users holder cannot make themselves Owner', async () => {
    const r = await save(sa, admin.membershipId, ownerRole, PRESET_KEYS.owner);
    expect(r.error?.code).toBe('P0001');
    expect(r.error?.message).toBe(REFUSED);
    expect(await roleOf(admin.membershipId)).toBe(designerRole);
    expect(await grantedOf(admin.membershipId)).toEqual(sorted(ADMIN_KEYS));
  }, 120000);

  it('AC-EZD-2024-1, AC-EZD-2024-4: a non-Owner settings_users holder cannot make another member Owner', async () => {
    const c = await addUser(t, { preset: 'crew', name: 'Cora Crew' });
    const r = await save(sa, c.membershipId, ownerRole, PRESET_KEYS.owner);
    expect(r.error?.code).toBe('P0001');
    expect(r.error?.message).toBe(REFUSED);
    expect(await roleOf(c.membershipId)).toBe(crewRole);
    expect(await grantedOf(c.membershipId)).toEqual(sorted(PRESET_KEYS.crew));
  }, 120000);

  it('AC-EZD-2024-1, AC-EZD-2024-4: a non-Owner settings_users holder cannot take the Owner role from an Owner', async () => {
    const o2 = await addUser(t, { preset: 'owner', name: 'Otto Owner' });
    const r = await save(sa, o2.membershipId, crewRole, PRESET_KEYS.crew);
    expect(r.error?.code).toBe('P0001');
    expect(r.error?.message).toBe(REFUSED);
    expect(await roleOf(o2.membershipId)).toBe(ownerRole);
    expect(await grantedOf(o2.membershipId)).toEqual(sorted(PRESET_KEYS.owner));
  }, 120000);

  it('AC-EZD-2024-1: the same holder still edits an Owner’s switches and language, and moves non-Owners between roles (Q-0695)', async () => {
    const o3 = await addUser(t, { preset: 'owner', name: 'Opal Owner' });
    const fewer = PRESET_KEYS.owner.filter((k) => k !== 'export');
    const sw = await save(sa, o3.membershipId, ownerRole, fewer, 'es');
    expect(sw.error).toBeNull();
    expect(await roleOf(o3.membershipId)).toBe(ownerRole);
    expect(await grantedOf(o3.membershipId)).toEqual(sorted(fewer));

    const c = await addUser(t, { preset: 'crew', name: 'Cy Crew' });
    const mv = await save(sa, c.membershipId, designerRole, PRESET_KEYS.designer);
    expect(mv.error).toBeNull();
    expect(await roleOf(c.membershipId)).toBe(designerRole);
  }, 120000);

  it('AC-EZD-2024-1, AC-EZD-2024-4: an Owner gives the Owner role and takes it away, their own row included', async () => {
    const c = await addUser(t, { preset: 'crew', name: 'Cam Crew' });
    const up = await save(so, c.membershipId, ownerRole, PRESET_KEYS.owner);
    expect(up.error).toBeNull();
    expect(await roleOf(c.membershipId)).toBe(ownerRole);
    const down = await save(so, c.membershipId, crewRole, PRESET_KEYS.crew);
    expect(down.error).toBeNull();
    expect(await roleOf(c.membershipId)).toBe(crewRole);

    const self = await addUser(t, { preset: 'owner', name: 'Sal Self' });
    const ss = await signIn(self.email);
    const own = await save(ss, self.membershipId, designerRole, [...PRESET_KEYS.designer, 'settings_users']);
    expect(own.error).toBeNull();
    expect(await roleOf(self.membershipId)).toBe(designerRole);
  }, 120000);

  it('AC-EZD-2024-1: holding every switch without the Owner preset is not enough', async () => {
    // A Crew member holding every switch is still not the Owner preset.
    const allSwitches = await addUser(t, { preset: 'crew', name: 'Al Switches', granted: PRESET_KEYS.owner });
    const sw = await signIn(allSwitches.email);
    const c = await addUser(t, { preset: 'crew', name: 'Cid Crew' });
    const r = await save(sw, c.membershipId, ownerRole, PRESET_KEYS.owner);
    expect(r.error?.message).toBe(REFUSED);
    expect(await roleOf(c.membershipId)).toBe(crewRole);
  }, 120000);

  it('AC-EZD-2024-2, AC-EZD-2024-4: a non-Owner holder cannot invite as Owner; nothing is written', async () => {
    const email = newEmail();
    const r = await invite(sa, email, ownerRole);
    expect(r.error?.code).toBe('P0001');
    expect(r.error?.message).toBe(REFUSED);
    expect(await membershipsWithEmail(email)).toBe(0);
    // Every other role still works for them (Q-0695).
    const ok = await invite(sa, newEmail(), designerRole);
    expect(ok.error).toBeNull();
  }, 120000);

  it('AC-EZD-2024-2, AC-EZD-2024-4: an Owner invites someone as Owner', async () => {
    const r = await invite(so, newEmail(), ownerRole);
    expect(r.error).toBeNull();
    const m = (r.data as { membershipId: string }).membershipId;
    expect(await roleOf(m)).toBe(ownerRole);
  }, 120000);

  it('AC-EZD-2024-1, AC-EZD-2024-2: an invited Owner’s role is under the same rule', async () => {
    const r = await invite(so, newEmail(), ownerRole);
    const m = (r.data as { membershipId: string }).membershipId;
    const down = await save(sa, m, crewRole, PRESET_KEYS.crew);
    expect(down.error?.message).toBe(REFUSED);
    expect(await roleOf(m)).toBe(ownerRole);
  }, 120000);

  it('AC-EZD-2024-4: a caller from another company cannot set a role on, or invite into, this company', async () => {
    const xo = await addUser(other, { preset: 'owner', name: 'Xena Owner' });
    const sx = await signIn(xo.email);
    const c = await addUser(t, { preset: 'crew', name: 'Cal Crew' });

    // Their own company's Owner role on this company's member: not found.
    const a = await save(sx, c.membershipId, await roleId(other, 'owner'), PRESET_KEYS.owner);
    expect(a.error?.code).toBe('P0002');
    // This company's Owner role on this company's member: not found.
    const b = await save(sx, c.membershipId, ownerRole, PRESET_KEYS.owner);
    expect(b.error?.code).toBe('P0002');
    expect(await roleOf(c.membershipId)).toBe(crewRole);
    expect(await grantedOf(c.membershipId)).toEqual(sorted(PRESET_KEYS.crew));

    // Inviting with this company's role: refused as invalid input, nothing written anywhere.
    const email = newEmail();
    const i = await invite(sx, email, ownerRole);
    expect(i.error?.code).toBe('22023');
    expect(await membershipsWithEmail(email)).toBe(0);
  }, 120000);

  it('AC-EZD-2024-3: list_users says whether the viewer holds the Owner preset', async () => {
    expect(await viewerIsOwner(so)).toBe(true);
    expect(await viewerIsOwner(sa)).toBe(false);
  }, 120000);
});
