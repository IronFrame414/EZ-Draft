// EZD-007a finding A2 (vault/plans/EZD-007a.md Interface contract; parent P-Step 7): members for the
// sign-in tests. createTestMember inserts an app_user with no auth user (auth_user_id null) and one
// membership (scope all), so Supabase Auth's before-user-created hook decides whether the email may get
// an account (Q-0050 (a)). cleanupTestMembers deletes the auth users with those emails, then the
// memberships, then the app_user rows (membership has no cascade from tenant), and is called in afterAll
// before EZD-006's cleanup(). EZD-007d adds addMembership here.
import { randomUUID } from 'node:crypto';
import { adminDb, harnessSql } from './rls/fixtures';

export type TestMemberStatus = 'invited' | 'active' | 'deactivated';

export type TestMember = { appUserId: string; membershipId: string; email: string };

const emails: string[] = [];
const membershipIds: string[] = [];
const appUserIds: string[] = [];

export const testMemberEmail = () => `ezd007-${randomUUID().slice(0, 12)}@example.test`;

type Row = Record<string, unknown>;

async function insertOne(table: string, row: Row): Promise<Row & { id: string }> {
  const { data, error } = await adminDb().from(table).insert(row).select('*').single();
  if (error)
    throw new Error(`auth-users insert into ${table} failed: ${error.code} ${error.message}`);
  return data as Row & { id: string };
}

export async function createTestMember(opts: {
  tenantId: string;
  status: TestMemberStatus;
  invitedAt?: Date | null;
}): Promise<TestMember> {
  const { tenantId, status } = opts;
  // Default: now for an invited member, else null; an explicit null stays null (P-Step 7).
  const invitedAt =
    opts.invitedAt === undefined ? (status === 'invited' ? new Date() : null) : opts.invitedAt;
  const email = testMemberEmail();
  const person = await insertOne('app_user', { email, auth_user_id: null });
  appUserIds.push(person.id);
  emails.push(email);
  const membership = await insertOne('membership', {
    tenant_id: tenantId,
    user_id: person.id,
    status,
    scope: 'all',
    invited_at: invitedAt ? invitedAt.toISOString() : null,
  });
  membershipIds.push(membership.id);
  return { appUserId: person.id, membershipId: membership.id, email };
}

// EZD-007d section 3 (vault/plans/EZD-007d.md; P-Step 7): a second membership for a person made by
// createTestMember (scope all; invitedAt default as createTestMember). Removed by cleanupTestMembers().
export async function addMembership(opts: {
  appUserId: string;
  tenantId: string;
  status: TestMemberStatus;
  invitedAt?: Date | null;
}): Promise<{ membershipId: string }> {
  const { appUserId, tenantId, status } = opts;
  const invitedAt =
    opts.invitedAt === undefined ? (status === 'invited' ? new Date() : null) : opts.invitedAt;
  const membership = await insertOne('membership', {
    tenant_id: tenantId,
    user_id: appUserId,
    status,
    scope: 'all',
    invited_at: invitedAt ? invitedAt.toISOString() : null,
  });
  membershipIds.push(membership.id);
  return { membershipId: membership.id };
}

// EZD-033 Step 8 (vault/plans/EZD-033.md): a member with a confirmed Auth account and a password, made
// through the Auth admin API (allowed in tests; no screen sets a password in Phase 0, Q-0095). The password
// is 20 random lowercase letters, checked with validateNewPassword (regenerated if it has a problem). The
// rules module is loaded inside the function, so a missing module fails only the tests that call this.
export type PasswordMember = TestMember & { password: string; authUserId: string };

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const randomLetters = (n: number) =>
  Array.from({ length: n }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

export async function randomPassword(email: string): Promise<string> {
  const { validateNewPassword } = await import('../src/lib/auth/password-rules');
  for (;;) {
    const candidate = randomLetters(20);
    if (validateNewPassword(candidate, email).length === 0) return candidate;
  }
}

export async function createPasswordMember(opts: {
  tenantId: string;
  status?: TestMemberStatus;
  invitedAt?: Date | null;
}): Promise<PasswordMember> {
  const { tenantId, status = 'active' } = opts;
  const member = await createTestMember({ tenantId, status, invitedAt: opts.invitedAt });
  const password = await randomPassword(member.email);
  const { data, error } = await adminDb().auth.admin.createUser({
    email: member.email,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`auth-users createUser failed: ${error?.code} ${error?.message}`);
  }
  // The EZD-007a guard nulls a password written while the row is created unconfirmed, so set it after.
  const set = await adminDb().auth.admin.updateUserById(data.user.id, { password });
  if (set.error) throw new Error(`auth-users set password failed: ${set.error.code}`);
  return { ...member, password, authUserId: data.user.id };
}

// An Auth account whose email is not confirmed. The caller passes the email of a member made by
// createTestMember; cleanupTestMembers() deletes the auth user by that email.
export async function createUnconfirmedPasswordUser(
  email: string,
  password: string,
): Promise<{ authUserId: string }> {
  const { data, error } = await adminDb().auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });
  if (error || !data.user) {
    throw new Error(`auth-users createUser failed: ${error?.code} ${error?.message}`);
  }
  return { authUserId: data.user.id };
}

export async function cleanupTestMembers(): Promise<void> {
  const s = harnessSql();
  if (emails.length) {
    const users = await s`select id from auth.users where email = any(${emails}::text[])`;
    for (const u of users) await adminDb().auth.admin.deleteUser(u.id as string);
  }
  if (membershipIds.length) {
    await s`delete from public.membership where id = any(${membershipIds}::uuid[])`;
  }
  if (appUserIds.length) {
    await s`delete from public.app_user where id = any(${appUserIds}::uuid[])`;
  }
  emails.length = 0;
  membershipIds.length = 0;
  appUserIds.length = 0;
}
