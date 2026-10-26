// EZD-113 T2 (vault/plans/EZD-113.md section 1 M1/M2, section 4; AC-EZD-113-1, -2, -6). Expected values:
// M1 (unique (tenant_id, lower(email)) archived rows included, check on a blank name, authenticated has
// select, insert, update and no delete), M2 (composite foreign key project_customer_fk), Q-0227, Q-0232,
// ARCH Row-level security (isolation harness). Rows are inserted with harnessSql().
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../test-harness/rls/fixtures';

async function codeOf(work: PromiseLike<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no_code';
  }
}

describe('EZD-113 customer table', () => {
  let tenantA = '';
  let tenantB = '';

  const insert = (tenant: string, name: string, email: string, archived = false) =>
    harnessSql()`
      insert into public.customer (tenant_id, name, email, archived_at)
      values (${tenant}::uuid, ${name}, ${email}, ${archived ? new Date().toISOString() : null})
      returning id`;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('customer', {
    makeRow: (t) => ({
      tenant_id: t,
      name: 'Iso',
      email: `iso-${randomUUID()}@example.test`,
    }),
  });

  it('T2 the email is unique per company ignoring case and archived rows, free in another company', async () => {
    await insert(tenantA, 'Ann', 'ann@example.test');
    expect(await codeOf(insert(tenantA, 'Ann Two', 'Ann@Example.test'))).toBe('23505');

    await insert(tenantA, 'Old', 'old@example.test', true);
    expect(await codeOf(insert(tenantA, 'Old Two', 'old@example.test'))).toBe('23505');

    expect(await codeOf(insert(tenantB, 'Ann B', 'ann@example.test'))).toBeNull();
  });

  it('T2 a blank name is refused by the check constraint', async () => {
    expect(await codeOf(insert(tenantA, ' ', `blank-${randomUUID()}@example.test`))).toBe('23514');
  });

  it('T2 authenticated may select, insert and update customers but never delete', async () => {
    const sql = harnessSql();
    const has = async (privilege: string) =>
      (
        await sql<{ ok: boolean }[]>`
          select has_table_privilege('authenticated', 'public.customer', ${privilege}) as ok`
      )[0].ok;
    expect(await has('SELECT')).toBe(true);
    expect(await has('INSERT')).toBe(true);
    expect(await has('UPDATE')).toBe(true);
    expect(await has('DELETE')).toBe(false);
  });

  it("T2 a project of one company cannot point at another company's customer", async () => {
    const [{ id: customerB }] = await insert(
      tenantB,
      'Link B',
      `link-${randomUUID()}@example.test`,
    );
    const [projectA] = await createProjects(tenantA, 1);
    const code = await codeOf(
      harnessSql()`update public.project set customer_id = ${customerB}::uuid where id = ${projectA}::uuid`,
    );
    expect(code).toBe('23503');
  });
});
