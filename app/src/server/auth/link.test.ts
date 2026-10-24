// EZD-007b T9, T29, T30 (vault/plans/EZD-007b.md section 4): public.link_app_user() ties a verified
// email to its own app_user row and accepts one valid pending invite (Q-0050 (a); Q-0043 (a); Q-0099 (b);
// Q-0044 (b)); public.current_app_user_id() returns the caller's app_user id while the session is live
// (Q-0052 (c)); both are executable by authenticated only (Q-0087 (ii)). The trigger
// private.membership_end_sessions() ends sessions on every narrowing change but not on invite acceptance.
// T29 and T30 run each case in one rolled-back transaction with direct auth.users / auth.sessions rows
// and the asClaims pattern (fixtures.ts), so no Auth API call and no email (CLAUDE.md rule 6).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TransactionSql, withRollback } from '../../../test-harness/rls/db';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { createTestMember, cleanupTestMembers } from '../../../test-harness/auth-users';

const PRIVILEGE = '42501';
const FUNCTIONS = ['link_app_user', 'current_app_user_id'] as const;

type LinkRow = {
  app_user_id: string;
  has_access: boolean;
  accepted_membership_id: string | null;
  accepted_tenant_id: string | null;
};

type Row = Record<string, unknown>;

// One case's rows, inserted as postgres inside the rolled-back transaction (section 4 intro).
async function insertCase(
  tx: TransactionSql,
  opts: {
    confirmed?: boolean;
    appUser?: { linkedTo?: string | null } | null;
    session?: boolean;
    memberships?: {
      id?: string;
      tenantId?: string;
      status: 'invited' | 'active' | 'deactivated';
      invitedAt?: Date | null;
    }[];
  },
) {
  const authUserId = randomUUID();
  const email = `ezd007b-${randomUUID().slice(0, 12)}@example.test`;
  const confirmed = opts.confirmed ?? true;
  await tx`
    insert into auth.users (id, email, email_confirmed_at, aud, role)
    values (${authUserId}::uuid, ${email}, ${confirmed ? new Date() : null}, 'authenticated', 'authenticated')`;
  const sessionId = randomUUID();
  if (opts.session ?? true) {
    await tx`insert into auth.sessions (id, user_id) values (${sessionId}::uuid, ${authUserId}::uuid)`;
  }
  let appUserId: string | null = null;
  if (opts.appUser !== null) {
    const linkedTo = opts.appUser?.linkedTo ?? null;
    const [row] = await tx<{ id: string }[]>`
      insert into public.app_user (email, auth_user_id) values (${email}, ${linkedTo}::uuid)
      returning id`;
    appUserId = row.id;
  }
  const membershipIds: string[] = [];
  const tenantIds: string[] = [];
  for (const m of opts.memberships ?? []) {
    let tenantId = m.tenantId;
    if (!tenantId) {
      const [t] = await tx<{ id: string }[]>`
        insert into public.tenant (name) values (${`EZD-007b ${randomUUID().slice(0, 8)}`}) returning id`;
      tenantId = t.id;
    }
    tenantIds.push(tenantId);
    const id = m.id ?? randomUUID();
    await tx`
      insert into public.membership (id, tenant_id, user_id, status, scope, invited_at)
      values (${id}::uuid, ${tenantId}::uuid, ${appUserId}::uuid, ${m.status}, 'all', ${m.invitedAt ?? null}::timestamptz)`;
    membershipIds.push(id);
  }
  return { authUserId, email, sessionId, appUserId, membershipIds, tenantIds };
}

// Calls link_app_user() then current_app_user_id() as role authenticated with the given claims, then
// resets the role so the caller can read back as postgres (fixtures.ts asClaims lines 219-230).
async function callAsUser(tx: TransactionSql, authUserId: string, sessionId: string) {
  const claims = JSON.stringify({ sub: authUserId, role: 'authenticated', session_id: sessionId });
  await tx.unsafe('set local role authenticated');
  await tx`select set_config('request.jwt.claims', ${claims}, true)`;
  const linked = await tx<LinkRow[]>`select * from public.link_app_user()`;
  const [cur] = await tx<{ id: string | null }[]>`select public.current_app_user_id() as id`;
  await tx.unsafe('reset role');
  return { linked, currentId: cur.id };
}

const authUserIdOf = async (tx: TransactionSql, appUserId: string | null) => {
  const [r] = await tx<{ auth_user_id: string | null }[]>`
    select auth_user_id from public.app_user where id = ${appUserId}::uuid`;
  return r.auth_user_id;
};
const statusOf = async (tx: TransactionSql, membershipId: string) => {
  const [r] = await tx<{ status: string }[]>`
    select status from public.membership where id = ${membershipId}::uuid`;
  return r.status;
};
const invitedAtOf = async (tx: TransactionSql, membershipId: string) => {
  const [r] = await tx<{ invited_at: Date | null }[]>`
    select invited_at from public.membership where id = ${membershipId}::uuid`;
  return r.invited_at?.toISOString() ?? null;
};
const sessionsOf = async (tx: TransactionSql, authUserId: string) => {
  const [r] = await tx<{ n: number }[]>`
    select count(*)::int as n from auth.sessions where user_id = ${authUserId}::uuid`;
  return r.n;
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const ago = (ms: number) => new Date(Date.now() - ms);

describe('EZD-007b linking and access functions', () => {
  let tenantId: string;

  beforeAll(async () => {
    tenantId = await createTenant();
  });

  afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  it("EZD-007b done when: link_app_user links only the caller's own row by verified email and current_app_user_id returns the caller's app_user id", async () => {
    // A: active member, app_user unlinked, auth user made by the admin API (EZD-007a STATUS deviation 4).
    const a = await createTestMember({ tenantId, status: 'active' });
    const aAuth = await adminDb().auth.admin.createUser({ email: a.email, email_confirm: true });
    expect(aAuth.error).toBeNull();
    const aAuthUserId = aAuth.data.user?.id as string;
    // B: a linked member whose row must stay untouched.
    const b: Member = await createMember({ tenantId, scope: 'all' });
    const s: Session = await signIn(a.email);

    const authUserIdFor = async (appUserId: string) => {
      const [r] = await harnessSql()<{ auth_user_id: string | null }[]>`
        select auth_user_id from public.app_user where id = ${appUserId}::uuid`;
      return r.auth_user_id;
    };

    // (a) anon cannot execute either function (SQLSTATE 42501).
    for (const fn of FUNCTIONS) {
      const code = await withRollback(harnessSql(), async (tx) => {
        await tx.unsafe('set local role anon');
        try {
          await tx.unsafe(`select public.${fn}()`);
          return 'no error';
        } catch (e) {
          return (e as { code?: string }).code;
        }
      });
      expect(code, fn).toBe(PRIVILEGE);
    }

    // (b) before linking: null; link: A's row only; B unchanged.
    const before = await s.serverDb.rpc('current_app_user_id');
    expect(before.error).toBeNull();
    expect(before.data).toBeNull();

    const link = await s.serverDb.rpc('link_app_user');
    expect(link.error).toBeNull();
    expect(link.data).toEqual([
      {
        app_user_id: a.appUserId,
        has_access: true,
        accepted_membership_id: null,
        accepted_tenant_id: null,
      },
    ]);
    expect(await authUserIdFor(a.appUserId)).toBe(aAuthUserId);
    expect(await authUserIdFor(b.appUserId)).toBe(b.authUserId);

    // (c) after linking the id is A's app_user id.
    const after = await s.serverDb.rpc('current_app_user_id');
    expect(after.error).toBeNull();
    expect(after.data).toBe(a.appUserId);

    // (d) a second call is idempotent.
    const again = await s.serverDb.rpc('link_app_user');
    expect(again.error).toBeNull();
    expect(again.data).toEqual(link.data);
    expect(await authUserIdFor(a.appUserId)).toBe(aAuthUserId);

    // (e) without the gate header both are refused (Q-0087 (ii)).
    for (const fn of FUNCTIONS) {
      const r = await s.browserDb.rpc(fn);
      expect(r.error?.code, fn).toBe(PRIVILEGE);
    }

    // (f) catalog grants: authenticated only.
    for (const fn of FUNCTIONS) {
      const [p] = await harnessSql()<Row[]>`
        select
          has_function_privilege('anon', ${`public.${fn}()`}, 'execute') as anon,
          has_function_privilege('authenticated', ${`public.${fn}()`}, 'execute') as authenticated,
          has_function_privilege('service_role', ${`public.${fn}()`}, 'execute') as service_role`;
      expect(p, fn).toEqual({ anon: false, authenticated: true, service_role: false });
    }
  });

  describe('EZD-007b T29 linking and acceptance rules (SQL)', () => {
    const run = <T>(fn: (tx: TransactionSql) => Promise<T>) => withRollback(harnessSql(), fn);

    it('(a) an unconfirmed email links nothing', async () => {
      await run(async (tx) => {
        const c = await insertCase(tx, { confirmed: false, memberships: [{ status: 'active' }] });
        const r = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(r.linked).toEqual([]);
        expect(r.currentId).toBeNull();
        expect(await authUserIdOf(tx, c.appUserId)).toBeNull();
      });
    });

    it('(b) a row already linked to another auth user is never re-pointed', async () => {
      await run(async (tx) => {
        const x = randomUUID();
        await tx`
          insert into auth.users (id, email, email_confirmed_at, aud, role)
          values (${x}::uuid, ${`ezd007b-x-${randomUUID().slice(0, 12)}@example.test`}, now(), 'authenticated', 'authenticated')`;
        const c = await insertCase(tx, {
          appUser: { linkedTo: x },
          memberships: [{ status: 'active' }],
        });
        const r = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(r.linked).toEqual([]);
        expect(r.currentId).toBeNull();
        expect(await authUserIdOf(tx, c.appUserId)).toBe(x);
      });
    });

    it('(c) no app_user with the email: no row', async () => {
      await run(async (tx) => {
        const c = await insertCase(tx, { appUser: null });
        const r = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(r.linked).toEqual([]);
        expect(r.currentId).toBeNull();
      });
    });

    it('(d) an ended session links nothing, accepts nothing and raises no error', async () => {
      await run(async (tx) => {
        const c = await insertCase(tx, {
          session: false,
          memberships: [{ status: 'invited', invitedAt: ago(DAY_MS) }],
        });
        const r = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(r.linked).toEqual([]);
        expect(r.currentId).toBeNull();
        expect(await authUserIdOf(tx, c.appUserId)).toBeNull();
        expect(await statusOf(tx, c.membershipIds[0])).toBe('invited');
      });
    });

    it('(e) an active member links and has access with nothing to accept', async () => {
      await run(async (tx) => {
        const c = await insertCase(tx, { memberships: [{ status: 'active' }] });
        const r = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(r.linked).toEqual([
          {
            app_user_id: c.appUserId,
            has_access: true,
            accepted_membership_id: null,
            accepted_tenant_id: null,
          },
        ]);
        expect(r.currentId).toBe(c.appUserId);
        expect(await authUserIdOf(tx, c.appUserId)).toBe(c.authUserId);
      });
    });

    it('(f) a valid invite is accepted, invited_at kept, session kept', async () => {
      await run(async (tx) => {
        const c = await insertCase(tx, {
          memberships: [{ status: 'invited', invitedAt: ago(6 * DAY_MS + 23 * HOUR_MS) }],
        });
        const sentAt = await invitedAtOf(tx, c.membershipIds[0]);
        const r = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(r.linked).toEqual([
          {
            app_user_id: c.appUserId,
            has_access: true,
            accepted_membership_id: c.membershipIds[0],
            accepted_tenant_id: c.tenantIds[0],
          },
        ]);
        expect(r.currentId).toBe(c.appUserId);
        expect(await statusOf(tx, c.membershipIds[0])).toBe('active');
        expect(await invitedAtOf(tx, c.membershipIds[0])).toBe(sentAt);
        expect(await sessionsOf(tx, c.authUserId)).toBe(1);
      });
    });

    const noAccess: [string, { status: 'invited' | 'deactivated'; invitedAt?: Date | null }][] = [
      ['(g) an expired invite', { status: 'invited', invitedAt: ago(7 * DAY_MS + MINUTE_MS) }],
      ['(h) an invite with no sent date', { status: 'invited', invitedAt: null }],
      ['(i) a deactivated member', { status: 'deactivated' }],
    ];
    for (const [title, m] of noAccess) {
      it(`${title} links without access and changes no status`, async () => {
        await run(async (tx) => {
          const c = await insertCase(tx, { memberships: [m] });
          const r = await callAsUser(tx, c.authUserId, c.sessionId);
          expect(r.linked).toEqual([
            {
              app_user_id: c.appUserId,
              has_access: false,
              accepted_membership_id: null,
              accepted_tenant_id: null,
            },
          ]);
          expect(r.currentId).toBe(c.appUserId);
          expect(await statusOf(tx, c.membershipIds[0])).toBe(m.status);
          expect(await authUserIdOf(tx, c.appUserId)).toBe(c.authUserId);
        });
      });
    }

    it('(j) an active company leaves another invite pending', async () => {
      await run(async (tx) => {
        const c = await insertCase(tx, {
          memberships: [{ status: 'active' }, { status: 'invited', invitedAt: ago(DAY_MS) }],
        });
        const r = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(r.linked).toEqual([
          {
            app_user_id: c.appUserId,
            has_access: true,
            accepted_membership_id: null,
            accepted_tenant_id: null,
          },
        ]);
        expect(r.currentId).toBe(c.appUserId);
        expect(await statusOf(tx, c.membershipIds[1])).toBe('invited');
      });
    });

    it('(k) two invites: the most recent is accepted, the other stays pending on both calls', async () => {
      await run(async (tx) => {
        const c = await insertCase(tx, {
          memberships: [
            { status: 'invited', invitedAt: ago(2 * DAY_MS) },
            { status: 'invited', invitedAt: ago(DAY_MS) },
          ],
        });
        const first = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(first.linked).toEqual([
          {
            app_user_id: c.appUserId,
            has_access: true,
            accepted_membership_id: c.membershipIds[1],
            accepted_tenant_id: c.tenantIds[1],
          },
        ]);
        expect(first.currentId).toBe(c.appUserId);
        expect(await statusOf(tx, c.membershipIds[0])).toBe('invited');
        const second = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(second.linked).toEqual([
          {
            app_user_id: c.appUserId,
            has_access: true,
            accepted_membership_id: null,
            accepted_tenant_id: null,
          },
        ]);
        expect(second.currentId).toBe(c.appUserId);
        expect(await statusOf(tx, c.membershipIds[0])).toBe('invited');
      });
    });

    it('(l) two invites with the same date: the higher membership id is accepted', async () => {
      await run(async (tx) => {
        const prefix = randomUUID().slice(0, 8);
        const id1 = `${prefix}-0000-4000-8000-000000000001`;
        const id2 = `${prefix}-0000-4000-8000-000000000002`;
        const c = await insertCase(tx, {
          memberships: [
            { id: id1, status: 'invited', invitedAt: ago(DAY_MS) },
            { id: id2, status: 'invited', invitedAt: ago(DAY_MS) },
          ],
        });
        // Same invited_at on both rows (the inserts ran at the same transaction time; make it exact).
        await tx`update public.membership set invited_at = (select invited_at from public.membership where id = ${id1}::uuid) where id = ${id2}::uuid`;
        const r = await callAsUser(tx, c.authUserId, c.sessionId);
        expect(r.linked).toEqual([
          {
            app_user_id: c.appUserId,
            has_access: true,
            accepted_membership_id: id2,
            accepted_tenant_id: c.tenantIds[1],
          },
        ]);
        expect(r.currentId).toBe(c.appUserId);
        expect(await statusOf(tx, id1)).toBe('invited');
        expect(await statusOf(tx, id2)).toBe('active');
      });
    });
  });

  describe('EZD-007b T30 session ending skips invite acceptance only', () => {
    const cases: [
      string,
      'invited' | 'active',
      (tx: TransactionSql, membershipId: string) => Promise<unknown>,
      number,
    ][] = [
      [
        '(a) invited to active keeps the session',
        'invited',
        (tx, id) => tx`update public.membership set status = 'active' where id = ${id}::uuid`,
        1,
      ],
      [
        '(b) active to deactivated ends it',
        'active',
        (tx, id) => tx`update public.membership set status = 'deactivated' where id = ${id}::uuid`,
        0,
      ],
      [
        '(c) invited to deactivated ends it',
        'invited',
        (tx, id) => tx`update public.membership set status = 'deactivated' where id = ${id}::uuid`,
        0,
      ],
      [
        '(d) active to invited ends it',
        'active',
        (tx, id) => tx`update public.membership set status = 'invited' where id = ${id}::uuid`,
        0,
      ],
      [
        '(e) scope all to listed ends it',
        'active',
        (tx, id) => tx`update public.membership set scope = 'listed' where id = ${id}::uuid`,
        0,
      ],
      [
        '(f) deleting the membership ends it',
        'active',
        (tx, id) => tx`delete from public.membership where id = ${id}::uuid`,
        0,
      ],
      [
        '(g) changing invited_at only keeps the session',
        'invited',
        (tx, id) => tx`update public.membership set invited_at = now() where id = ${id}::uuid`,
        1,
      ],
    ];

    for (const [title, status, statement, expected] of cases) {
      it(title, async () => {
        await withRollback(harnessSql(), async (tx) => {
          const c = await insertCase(tx, {
            memberships: [{ status, invitedAt: status === 'invited' ? ago(DAY_MS) : null }],
          });
          // The app_user row is linked to U before the statement (section 4, T30 input).
          await tx`update public.app_user set auth_user_id = ${c.authUserId}::uuid where id = ${c.appUserId}::uuid`;
          expect(await sessionsOf(tx, c.authUserId)).toBe(1);
          await statement(tx, c.membershipIds[0]);
          expect(await sessionsOf(tx, c.authUserId)).toBe(expected);
        });
      });
    }
  });
});
