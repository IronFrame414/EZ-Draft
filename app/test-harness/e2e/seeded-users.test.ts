// EZD-180 (vault/plans/EZD-180.md section 4): the global teardown hands the seeded people back unlinked, so the seed
// checks (EZD-005b T17 (e), EZD-005b and EZD-016c seed.test.ts, EZD-007d T5) pass whether or not browser sign-ins ran
// first. T1-T4 use fixture people only: Vitest runs in parallel and seed.test.ts reads the seeded rows at the same time.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  CREW_EMAIL,
  CREW_USER_ID,
  DESIGNER_EMAIL,
  DESIGNER_USER_ID,
  FOREMAN_EMAIL,
  FOREMAN_USER_ID,
  JOSH_EMAIL,
  JOSH_USER_ID,
  TENANT_2_OWNER_EMAIL,
  TENANT_2_OWNER_USER_ID,
} from '../../test-utils/seed-ids';
import { cleanup, closeHarness, createMember, createTenant, harnessSql } from '../rls/fixtures';
import { SEEDED_USERS, deleteAuthUserOrThrow, restoreSeededUsers } from './seeded-users';
import type { DeleteAuthUser, SeededUser } from './seeded-users';

// The error a promise rejects with; a promise that resolves fails the test.
async function errorOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
  throw new Error('expected a rejection, the promise resolved');
}

describe('EZD-180 seeded people after browser tests', () => {
  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-180 done when: restoreSeededUsers unlinks the listed people and deletes their auth users, and leaves everyone else as found', async () => {
    const tenantId = await createTenant();
    const a = await createMember({ tenantId, scope: 'all' });
    const b = await createMember({ tenantId, scope: 'all' });
    const c = await createMember({ tenantId, scope: 'all' });
    // B's auth user stays, as after a failed sign-in: linked to nothing.
    await harnessSql()`update public.app_user set auth_user_id = null where id = ${b.appUserId}::uuid`;

    await restoreSeededUsers([
      { id: a.appUserId, email: a.email.toUpperCase() },
      { id: b.appUserId, email: b.email },
    ]);

    const sql = harnessSql();
    for (const person of [a, b]) {
      const rows = await sql`
        select email, auth_user_id::text as auth_user_id from public.app_user
        where id = ${person.appUserId}::uuid`;
      expect(rows).toEqual([{ email: person.email, auth_user_id: null }]);
      const authLeft = await sql`
        select count(*)::int as n from auth.users where id = ${person.authUserId}::uuid`;
      expect(authLeft[0].n).toBe(0);
      const memberships = await sql`
        select status, scope from public.membership where user_id = ${person.appUserId}::uuid`;
      expect(memberships).toEqual([{ status: 'active', scope: 'all' }]);
    }

    const kept = await sql`
      select auth_user_id::text as auth_user_id from public.app_user where id = ${c.appUserId}::uuid`;
    expect(kept).toEqual([{ auth_user_id: c.authUserId }]);
    const keptAuth = await sql`
      select count(*)::int as n from auth.users where id = ${c.authUserId}::uuid`;
    expect(keptAuth[0].n).toBe(1);
  });

  it('EZD-180 T2 nothing to restore deletes nothing', async () => {
    const deleter = vi.fn<DeleteAuthUser>(async () => {});
    await expect(restoreSeededUsers([], deleter)).resolves.toBeUndefined();
    const unknown: SeededUser = {
      id: randomUUID(),
      email: 'ezd180-' + randomUUID() + '@example.test',
    };
    await expect(restoreSeededUsers([unknown], deleter)).resolves.toBeUndefined();
    expect(deleter).not.toHaveBeenCalled();
  });

  it('EZD-180 T3 a person still linked fails the check', async () => {
    const tenantId = await createTenant();
    const d = await createMember({ tenantId, scope: 'all' });
    // The stub deletes nothing, so D stays linked and its auth user stays.
    const stub = vi.fn<DeleteAuthUser>(async () => {});
    const error = await errorOf(restoreSeededUsers([{ id: d.appUserId, email: d.email }], stub));
    expect(error.message).toBe(
      `seeded users not restored: linked ${d.appUserId}, auth users left 1`,
    );
    expect(stub).toHaveBeenCalledTimes(1);
    expect(stub).toHaveBeenCalledWith(d.authUserId);
  });

  it('EZD-180 T4 a failed delete throws', async () => {
    const error = await errorOf(deleteAuthUserOrThrow(randomUUID()));
    expect(error.message).toBe('restore of seeded users failed: deleteUser user_not_found');
  });

  it('EZD-180 T5 SEEDED_USERS is every seeded person', async () => {
    expect(SEEDED_USERS.map((u) => u.id)).toEqual([
      JOSH_USER_ID,
      DESIGNER_USER_ID,
      FOREMAN_USER_ID,
      CREW_USER_ID,
      TENANT_2_OWNER_USER_ID,
    ]);
    expect(SEEDED_USERS.map((u) => u.email)).toEqual([
      JOSH_EMAIL,
      DESIGNER_EMAIL,
      FOREMAN_EMAIL,
      CREW_EMAIL,
      TENANT_2_OWNER_EMAIL,
    ]);
    const rows = await harnessSql()`
      select id::text as id, email from public.app_user
      where id::text like '00000000-0000-4000-8000-%' order by id`;
    const expected = [...SEEDED_USERS]
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
      .map((u) => ({ id: u.id, email: u.email }));
    expect(rows).toEqual(expected);
    expect(Object.isFrozen(SEEDED_USERS)).toBe(true);
    for (const entry of SEEDED_USERS) expect(Object.isFrozen(entry)).toBe(true);
  });

  it('EZD-180 T6 teardown restores first and combines errors', async () => {
    const saved = { ...process.env };
    const restore = vi.fn<(users: readonly SeededUser[]) => Promise<void>>(async () => {});
    vi.doMock('./seeded-users', async () => ({
      ...(await vi.importActual<typeof import('./seeded-users')>('./seeded-users')),
      restoreSeededUsers: restore,
    }));
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd180-'));
    const log = path.join(dir, 'net-guard.log');
    try {
      vi.resetModules();
      const { default: globalTeardown } = await import('./global-teardown');
      const { SEEDED_USERS: mockedUsers } = await import('./seeded-users');

      // (a) no guard log, restore resolves
      delete process.env.EZD_NET_GUARD_LOG;
      restore.mockResolvedValueOnce(undefined);
      await expect(globalTeardown()).resolves.toBeUndefined();
      expect(restore).toHaveBeenCalledTimes(1);
      expect(restore.mock.calls[0][0]).toBe(mockedUsers);
      restore.mockClear();

      // (b) no guard log, restore rejects
      restore.mockRejectedValueOnce(new Error('restore boom'));
      const b = await errorOf(globalTeardown());
      expect(b.message).toBe('restore boom');
      restore.mockClear();

      // (c) guard log holds a blocked host, restore rejects: one error, guard message first
      writeFileSync(log, JSON.stringify({ host: 'api.bfl.ai' }) + '\n');
      process.env.EZD_NET_GUARD_LOG = log;
      restore.mockRejectedValueOnce(new Error('restore boom'));
      const c = await errorOf(globalTeardown());
      expect(c.message).toBe('Live network blocked in browser tests: api.bfl.ai; restore boom');
      restore.mockClear();

      // (d) guard log holds a blocked host, restore resolves
      restore.mockResolvedValueOnce(undefined);
      const d = await errorOf(globalTeardown());
      expect(d.message).toBe('Live network blocked in browser tests: api.bfl.ai');
    } finally {
      vi.doUnmock('./seeded-users');
      vi.resetModules();
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
