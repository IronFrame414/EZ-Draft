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
