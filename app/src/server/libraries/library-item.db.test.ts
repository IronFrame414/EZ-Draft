// EZD-131 (03e library_item; S15h Decisions 1; CLAUDE.md rule 4). Expected values: the 03e kinds (note,
// abbreviation, hatch, part, saved_group, task_template), a non-blank name, `data` a JSON object, one
// abbreviation per company ignoring case (other kinds may share a name), and ARCH Row-level security
// (isolation harness). Rows are inserted with harnessSql().
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';

async function codeOf(work: PromiseLike<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no_code';
  }
}

describe('EZD-131 library_item table', () => {
  let tenantA = '';
  let tenantB = '';

  const insert = (tenant: string, kind: string, name: string, data: unknown = {}) =>
    harnessSql()`
      insert into public.library_item (tenant_id, kind, name, data)
      values (${tenant}::uuid, ${kind}, ${name}, ${JSON.stringify(data)}::text::jsonb)
      returning id`;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('library_item', {
    makeRow: (t) => ({
      tenant_id: t,
      kind: 'saved_group',
      name: 'Iso group',
      data: {},
    }),
  });

  it('accepts each 03e kind and refuses any other', async () => {
    for (const kind of ['note', 'abbreviation', 'hatch', 'part', 'saved_group', 'task_template']) {
      expect(await codeOf(insert(tenantA, kind, `Kind ${kind}`)), kind).toBeNull();
    }
    expect(await codeOf(insert(tenantA, 'detail', 'A detail'))).toBe('23514');
  });

  it('refuses a blank name and data that is not an object', async () => {
    expect(await codeOf(insert(tenantA, 'part', '  '))).toBe('23514');
    expect(await codeOf(insert(tenantA, 'part', 'Rod', ['x']))).toBe('23514');
  });

  it('one abbreviation per company ignoring case; free in another company; saved groups may repeat', async () => {
    await insert(tenantA, 'abbreviation', 'GFCI', { meaning: 'Ground-fault circuit interrupter' });
    expect(await codeOf(insert(tenantA, 'abbreviation', 'gfci', { meaning: 'x' }))).toBe('23505');
    expect(await codeOf(insert(tenantB, 'abbreviation', 'GFCI', { meaning: 'x' }))).toBeNull();
    await insert(tenantA, 'saved_group', 'Vanity set');
    expect(await codeOf(insert(tenantA, 'saved_group', 'Vanity set'))).toBeNull();
  });

  it("a member reads their own company's items and none of another company's", async () => {
    const member = await createMember({ tenantId: tenantB, scope: 'all' });
    const session = await signIn(member.email);
    const { data, error } = await session.serverDb.from('library_item').select('tenant_id');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((r) => r.tenant_id))).toEqual(new Set([tenantB]));
  });
});
