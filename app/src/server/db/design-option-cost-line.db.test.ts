// EZD-1009 (03c design_option internal_cost_lines; 13b R2: option cost lines are See company costs; 03b rule 2;
// CLAUDE.md rule 4; vault/build/assumptions.md EZD-1009 "Where internal_cost_lines live"): the cost lines table.
// One company cannot read or change another company's lines (the EZD-006 isolation harness and a direct check);
// members read only projects in their scope; no member writes yet (EZD-1010 adds the cost-lines route); the browser
// client without the API gate reads nothing. Policies never read permission rows (EZD-102), so See company costs is
// the routes' check, as for catalog_item.unit_cost; unit_cost is in MONEY_FIELDS for the EZD-133 route tests.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

describe('EZD-1009 design_option_cost_line RLS', () => {
  describeTenantIsolation('design_option_cost_line', {
    makeRow: (t, ctx) => ({
      tenant_id: t,
      project_id: ctx.projectIds[0],
      option_id: randomUUID(),
      item: 'Iso beam',
      qty: 1,
      unit_cost: 10,
    }),
  });

  let tenantA = '';
  let tenantB = '';
  let projectA = '';
  let projectA2 = '';
  let projectB = '';
  let lineA = '';
  let lineA2 = '';
  let lineB = '';
  let costsA: Session;
  let listedA: Session;
  let costsB: Session;

  const addLine = async (tenant: string, project: string, item: string) =>
    (
      await harnessSql()<{ id: string }[]>`
        insert into public.design_option_cost_line (tenant_id, project_id, option_id, item, qty, unit_cost, sort)
        values (${tenant}::uuid, ${project}::uuid, ${randomUUID()}::uuid, ${item}, 3, 412.50, 0)
        returning id`
    )[0]!.id;
  const ids = async (s: Session) => {
    const { data, error } = await s.serverDb
      .from('design_option_cost_line')
      .select('id')
      .order('item');
    expect(error).toBeNull();
    return (data as { id: string }[]).map((r) => r.id).sort();
  };

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [projectA, projectA2] = await createProjects(tenantA, 2);
    [projectB] = await createProjects(tenantB, 1);
    lineA = await addLine(tenantA, projectA, 'Box beam 6x8');
    lineA2 = await addLine(tenantA, projectA2, 'Cleats');
    lineB = await addLine(tenantB, projectB, 'Other company beam');

    const withCosts = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, withCosts.membershipId, ['view_projects', 'see_company_costs']);
    const listed = await createMember({ tenantId: tenantA, scope: 'listed', listed: [projectA2] });
    await setPermissions(tenantA, listed.membershipId, ['view_projects', 'see_company_costs']);
    const otherCompany = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, otherCompany.membershipId, [
      'view_projects',
      'see_company_costs',
    ]);
    [costsA, listedA, costsB] = await Promise.all([
      signIn(withCosts.email),
      signIn(listed.email),
      signIn(otherCompany.email),
    ]);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  }, 180000);

  it('a member reads only their own company lines, on projects in scope', async () => {
    expect(await ids(costsA)).toEqual([lineA, lineA2].sort());
    expect(await ids(costsB)).toEqual([lineB]);
    expect(await ids(listedA)).toEqual([lineA2]);
  });

  it("one company cannot change or delete another company's lines, nor add a line to its project", async () => {
    const upd = await costsA.serverDb
      .from('design_option_cost_line')
      .update({ unit_cost: 1 })
      .eq('id', lineB)
      .select('id');
    expect(upd.data ?? []).toEqual([]);
    const del = await costsA.serverDb
      .from('design_option_cost_line')
      .delete()
      .eq('id', lineB)
      .select('id');
    expect(del.data ?? []).toEqual([]);
    const ins = await costsA.serverDb.from('design_option_cost_line').insert({
      tenant_id: tenantB,
      project_id: projectB,
      option_id: randomUUID(),
      item: 'Planted',
      qty: 1,
      unit_cost: 1,
    });
    expect(ins.error).not.toBeNull();
    const rows = await harnessSql()<{ unit_cost: string; n: number }[]>`
      select unit_cost::text, (select count(*)::int from public.design_option_cost_line where tenant_id = ${tenantB}::uuid) as n
      from public.design_option_cost_line where id = ${lineB}::uuid`;
    expect(rows).toEqual([{ unit_cost: '412.50', n: 1 }]);
  });

  it('members have no write policy yet: their own company lines cannot be changed either', async () => {
    const ins = await costsA.serverDb.from('design_option_cost_line').insert({
      tenant_id: tenantA,
      project_id: projectA,
      option_id: randomUUID(),
      item: 'Own',
      qty: 1,
      unit_cost: 1,
    });
    expect(ins.error).not.toBeNull();
    const upd = await costsA.serverDb
      .from('design_option_cost_line')
      .update({ unit_cost: 1 })
      .eq('id', lineA)
      .select('id');
    expect(upd.data ?? []).toEqual([]);
  });

  it('the browser client without the API gate reads nothing', async () => {
    const { data } = await costsA.browserDb.from('design_option_cost_line').select('id');
    expect(data ?? []).toEqual([]);
  });
});
