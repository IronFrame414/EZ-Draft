// EZD-426 AC-EZD-426-2: two harness cleanups of overlapping fixture sets run at the same time, many rounds,
// as two browser-test workers do; none fails and each round removes exactly the rows it created.
// Worker A owns tenants T1, T2 and people U1, U2; worker B owns T2, T3 and U2, U3 (T2 and U2 overlap).
// Every person is a member of every tenant; a control company with its own member must survive.
// Expected counts come from the rows created here.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  cleanupCreated,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
} from './fixtures';

const ROUNDS = 15;
const tag = randomUUID().slice(0, 8);
let n = 0;

async function addPerson(): Promise<string> {
  const email = `ezd426-${tag}-${++n}@example.com`;
  const rows = await harnessSql()`insert into public.app_user (email) values (${email}) returning id`;
  return rows[0].id as string;
}

// Active membership in the person's own tenant; invited elsewhere, so a person's delete never removes a
// still-present company's only settings_users holder (EZD-106 guard).
async function addMembership(tenantId: string, userId: string, status: 'active' | 'invited') {
  await harnessSql()`
    insert into public.membership (tenant_id, user_id, status, scope)
    values (${tenantId}::uuid, ${userId}::uuid, ${status}, 'all')`;
}

async function count(query: Promise<{ n: number }[]>): Promise<number> {
  return (await query)[0].n;
}

let controlTenant = '';
let controlUser = '';

describe('EZD-426 concurrent fixture cleanup', () => {
  afterAll(async () => {
    if (controlTenant) {
      await cleanupCreated({ tenantIds: [controlTenant], appUserIds: [controlUser], authUserIds: [] });
    }
    await cleanup();
    await closeHarness();
  });

  it(
    'EZD-426 two overlapping cleanups at once never fail and delete only their own rows',
    async () => {
      const s = harnessSql();
      controlTenant = await createTenant();
      controlUser = await addPerson();
      await addMembership(controlTenant, controlUser, 'active');
      await createProjects(controlTenant, 1);

      for (let round = 1; round <= ROUNDS; round++) {
        const tenants = [await createTenant(), await createTenant(), await createTenant()];
        const people = [await addPerson(), await addPerson(), await addPerson()];
        for (const [i, t] of tenants.entries()) {
          await createProjects(t, 2);
          for (const [j, u] of people.entries()) await addMembership(t, u, i === j ? 'active' : 'invited');
        }
        const [t1, t2, t3] = tenants;
        const [u1, u2, u3] = people;

        const results = await Promise.allSettled([
          cleanupCreated({ tenantIds: [t1, t2], appUserIds: [u1, u2], authUserIds: [] }),
          cleanupCreated({ tenantIds: [t3, t2], appUserIds: [u3, u2], authUserIds: [] }),
        ]);
        expect(results.map((r) => r.status), `round ${round}`).toEqual(['fulfilled', 'fulfilled']);

        const left = await Promise.all([
          count(s`select count(*)::int as n from public.tenant where id = any(${tenants}::uuid[])`),
          count(s`select count(*)::int as n from public.project where tenant_id = any(${tenants}::uuid[])`),
          count(s`select count(*)::int as n from public.membership where tenant_id = any(${tenants}::uuid[])
                  or user_id = any(${people}::uuid[])`),
          count(s`select count(*)::int as n from public.app_user where id = any(${people}::uuid[])`),
        ]);
        expect(left, `round ${round}`).toEqual([0, 0, 0, 0]);

        const kept = await Promise.all([
          count(s`select count(*)::int as n from public.tenant where id = ${controlTenant}::uuid`),
          count(s`select count(*)::int as n from public.project where tenant_id = ${controlTenant}::uuid`),
          count(s`select count(*)::int as n from public.membership where tenant_id = ${controlTenant}::uuid`),
          count(s`select count(*)::int as n from public.app_user where id = ${controlUser}::uuid`),
        ]);
        expect(kept, `round ${round}`).toEqual([1, 1, 1, 1]);
      }
    },
    180_000,
  );
});
