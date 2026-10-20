// EZD-007a T7, T28, T26 part a (vault/plans/EZD-007a.md section 4): the before-user-created hook
// private.auth_before_user_created (Q-0165 (a)) lets Supabase Auth create an account only for an email
// with an active membership or a valid pending invite (R24 #14; Q-0050 (a); 7 days from the EZD-105 row),
// and the guard trigger on auth.users drops a password while the email is unconfirmed (Q-0094).
// Auth calls use a publishable-key client with no session (Auth is not behind the API gate); database
// reads use adminSql(). Every email is fresh; no seeded row is changed; no live email (CLAUDE.md rule 6).
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSql, type Sql } from '../../../test-harness/rls/db';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createTenant,
} from '../../../test-harness/rls/fixtures';
import { createTestMember, cleanupTestMembers } from '../../../test-harness/auth-users';

// P-Step 2.1: the refusal object, compared as jsonb.
const REFUSAL = { error: { http_code: 403, message: 'sign_in_not_allowed' } };
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

describe('EZD-007a account gate', () => {
  let sql: Sql;
  let tenantId: string;
  const nobodyEmails: string[] = [];
  const nobodyEmail = () => {
    const e = `nobody-${randomUUID().slice(0, 12)}@example.test`;
    nobodyEmails.push(e);
    return e;
  };
  const auth = () => anonDb({ gate: false }).auth;

  async function authUserCount(email: string): Promise<number> {
    const rows = await sql`select count(*)::int as n from auth.users where email = ${email}`;
    return rows[0].n as number;
  }

  beforeAll(async () => {
    sql = adminSql();
    tenantId = await createTenant();
  });

  afterAll(async () => {
    // Belt and braces: an auth user that a failing gate let through for a nobody- email is removed.
    if (nobodyEmails.length) {
      const rows = await sql`select id from auth.users where email = any(${nobodyEmails}::text[])`;
      for (const r of rows) await adminDb().auth.admin.deleteUser(r.id as string);
    }
    await cleanupTestMembers();
    await cleanup();
    await sql.end({ timeout: 5 });
    await closeHarness();
  });

  it('EZD-007a T7 direct Auth API sign-up and code request are refused for an unknown email', async () => {
    const email = nobodyEmail();
    const signUp = await auth().signUp({ email, password: 'x'.repeat(12) });
    expect(signUp.error).not.toBeNull();
    const otp = await auth().signInWithOtp({ email, options: { shouldCreateUser: true } });
    expect(otp.error).not.toBeNull();
    expect(await authUserCount(email)).toBe(0);
  });

  it('EZD-007a done when: Supabase Auth creates no account for an email without an active membership or valid pending invite', async () => {
    const now = Date.now();
    // (a)-(e): members in a fresh tenant; (f): an app_user with no membership.
    const a = await createTestMember({ tenantId, status: 'active' });
    const b = await createTestMember({
      tenantId,
      status: 'invited',
      invitedAt: new Date(now - 7 * DAY_MS + 5 * MINUTE_MS),
    });
    const c = await createTestMember({
      tenantId,
      status: 'invited',
      invitedAt: new Date(now - 7 * DAY_MS - 5 * MINUTE_MS),
    });
    const d = await createTestMember({ tenantId, status: 'invited', invitedAt: null });
    const e = await createTestMember({ tenantId, status: 'deactivated' });
    const fEmail = `ezd007-${randomUUID().slice(0, 12)}@example.test`;
    const { data: fRow, error: fError } = await adminDb()
      .from('app_user')
      .insert({ email: fEmail, auth_user_id: null })
      .select('id')
      .single();
    expect(fError).toBeNull();
    nobodyEmails.push(fEmail);

    try {
      const request = (email: string) =>
        auth().signInWithOtp({ email, options: { shouldCreateUser: true } });

      // (a), (b): allowed, one auth user each.
      for (const m of [a, b]) {
        const r = await request(m.email);
        expect(r.error, m.email).toBeNull();
        expect(await authUserCount(m.email), m.email).toBe(1);
      }
      // (c)-(f): refused, no auth user.
      for (const email of [c.email, d.email, e.email, fEmail]) {
        const r = await request(email);
        expect(r.error, email).not.toBeNull();
        expect(await authUserCount(email), email).toBe(0);
      }

      // (g) the invite rule as SQL (Q-0050 (a); 7 days; null date fails closed).
      const g = await sql`
        select
          private.invite_is_valid('invited', now() - interval '6 days') as v1,
          private.invite_is_valid('invited', now() - interval '8 days') as v2,
          private.invite_is_valid('invited', null) as v3,
          private.invite_is_valid('active', now()) as v4,
          private.invite_is_valid('deactivated', now()) as v5`;
      expect([g[0].v1, g[0].v2, g[0].v3, g[0].v4, g[0].v5]).toEqual([
        true,
        false,
        false,
        false,
        false,
      ]);

      // (h) the hook function called directly: upper-cased known email allowed; unknown and missing refused.
      const h = await sql`
        select
          private.auth_before_user_created(${JSON.stringify({ user: { email: a.email.toUpperCase() } })}::text::jsonb) as allowed,
          private.auth_before_user_created(${JSON.stringify({ user: { email: nobodyEmail() } })}::text::jsonb) = ${JSON.stringify(REFUSAL)}::text::jsonb as refused_unknown,
          private.auth_before_user_created(${JSON.stringify({ user: {} })}::text::jsonb) = ${JSON.stringify(REFUSAL)}::text::jsonb as refused_missing`;
      expect(h[0].allowed).toEqual({});
      expect(h[0].refused_unknown).toBe(true);
      expect(h[0].refused_missing).toBe(true);
    } finally {
      await sql`delete from public.app_user where id = ${(fRow as { id: string }).id}::uuid`;
    }
  });

  it('EZD-007a T26 part a: a password given at sign-up does not survive while the email is unconfirmed', async () => {
    const p = await createTestMember({ tenantId, status: 'active' });
    const r = await createTestMember({ tenantId, status: 'active' });
    const password = randomBytes(15).toString('base64url').slice(0, 20);
    expect(password).toHaveLength(20);

    const signUp = await auth().signUp({ email: p.email, password });
    expect(signUp.error).toBeNull();

    const signIn = await auth().signInWithPassword({ email: p.email, password });
    expect(signIn.error).not.toBeNull();
    expect(signIn.data.session).toBeNull();

    // Reference: a member who signed in by code only (no password), read the same way.
    const ref = await auth().signInWithOtp({ email: r.email, options: { shouldCreateUser: true } });
    expect(ref.error).toBeNull();

    const read = (email: string) =>
      sql`select email_confirmed_at, encrypted_password from auth.users where email = ${email}`;
    const pRows = await read(p.email);
    const rRows = await read(r.email);
    expect(pRows).toHaveLength(1);
    expect(rRows).toHaveLength(1);
    expect(pRows[0].email_confirmed_at).toBeNull();
    expect(pRows[0].encrypted_password).toEqual(rRows[0].encrypted_password);
    expect(String(pRows[0].encrypted_password ?? '').startsWith('$2')).toBe(false);
  });
});
