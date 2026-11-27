// EZD-614 (S15e Appliance rating defaults "Fallback ratings (volts, amps or VA) per appliance type", "Owner enters";
// Q-0766 "every company can edit, add and delete rows"; CLAUDE.md rule 4). Expected values: the migration header
// (20261127130000_appliance_rating_default.sql): one row per type and company, volts 120 or 240 (09b:35; Q-0704;
// 09s Rules), amps above 0 in hundredths, a company starts with no rows; every member reads their own company's rows;
// only save_appliance_rating_defaults writes, with settings_catalog (S15e Permissions "Manage users and settings for
// this section"). Calls go through the gated serverDb of `signIn`, as the routes do.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

type In = { appliance_type: unknown; name: unknown; volts: unknown; amps: unknown };
const row = (appliance_type: string, name: string, volts: number, amps: number): In => ({
  appliance_type,
  name,
  volts,
  amps,
});

describe('EZD-614 appliance_rating_default', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session; // settings_catalog in company A
  let plain: Session; // company A, no settings_catalog
  let ownerB: Session; // settings_catalog in company B

  const save = (s: Session, rows: unknown) =>
    s.serverDb.rpc('save_appliance_rating_defaults', { p_rows: rows as never });
  const stored = async (tenant: string) =>
    (
      await harnessSql()`
        select appliance_type, name, volts, amps::text as amps from public.appliance_rating_default
        where tenant_id = ${tenant}::uuid order by appliance_type`
    ).map((r) => ({ ...r }));

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects', 'settings_catalog']);
    owner = await signIn(m1.email);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects']);
    plain = await signIn(m2.email);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, ['view_projects', 'settings_catalog']);
    ownerB = await signIn(m3.email);
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('appliance_rating_default', {
    makeRow: (t) => ({
      tenant_id: t,
      appliance_type: 'dishwasher',
      name: 'Dishwasher',
      volts: 120,
      amps: 10,
    }),
  });

  it('a company starts with no rows (Owner enters)', async () => {
    expect(await stored(tenantA)).toEqual([]);
  });

  it('with settings_catalog the list is saved; the types added are returned for the event', async () => {
    const r = await save(owner, [
      row('dishwasher', 'Dishwasher', 120, 10),
      row('range', 'Range, electric', 240, 48.75),
    ]);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ tenant_id: tenantA, changed: ['dishwasher', 'range'] }]);
    expect(await stored(tenantA)).toEqual([
      { appliance_type: 'dishwasher', name: 'Dishwasher', volts: 120, amps: '10.00' },
      { appliance_type: 'range', name: 'Range, electric', volts: 240, amps: '48.75' },
    ]);
  });

  it('saving the same list changes nothing; an edit, an addition and a removal are each named', async () => {
    const same = await save(owner, [
      row('dishwasher', 'Dishwasher', 120, 10),
      row('range', 'Range, electric', 240, 48.75),
    ]);
    expect(same.data).toEqual([{ tenant_id: tenantA, changed: [] }]);
    const next = await save(owner, [
      row('dishwasher', 'Dishwasher', 120, 12),
      row('dryer', 'Dryer', 240, 22.5),
    ]);
    expect(next.error).toBeNull();
    expect(next.data).toEqual([{ tenant_id: tenantA, changed: ['dishwasher', 'dryer', 'range'] }]);
    expect(await stored(tenantA)).toEqual([
      { appliance_type: 'dishwasher', name: 'Dishwasher', volts: 120, amps: '12.00' },
      { appliance_type: 'dryer', name: 'Dryer', volts: 240, amps: '22.50' },
    ]);
  });

  it('without settings_catalog the save is refused and nothing changes', async () => {
    const r = await save(plain, [row('dishwasher', 'Dishwasher', 120, 99)]);
    expect(r.error?.code).toBe('42501');
    expect((await stored(tenantA)).map((x) => x.amps)).toEqual(['12.00', '22.50']);
  });

  it('a member reads their own company rows and writes none directly', async () => {
    const read = await plain.serverDb
      .from('appliance_rating_default')
      .select('tenant_id, appliance_type');
    expect(read.error).toBeNull();
    expect(new Set(read.data!.map((r) => r.tenant_id))).toEqual(new Set([tenantA]));
    const ins = await owner.serverDb
      .from('appliance_rating_default')
      .insert({
        tenant_id: tenantA,
        appliance_type: 'washer',
        name: 'Washer',
        volts: 120,
        amps: 10,
      });
    expect(ins.error?.code).toBe('42501');
    await owner.serverDb
      .from('appliance_rating_default')
      .update({ amps: 1 })
      .eq('tenant_id', tenantA);
    await owner.serverDb.from('appliance_rating_default').delete().eq('tenant_id', tenantA);
    expect((await stored(tenantA)).map((x) => x.amps)).toEqual(['12.00', '22.50']);
  });

  it("another company's save touches only its own rows", async () => {
    const r = await save(ownerB, [row('dishwasher', 'DW', 120, 8)]);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ tenant_id: tenantB, changed: ['dishwasher'] }]);
    expect((await stored(tenantA)).map((x) => x.amps)).toEqual(['12.00', '22.50']);
    expect(await stored(tenantB)).toEqual([
      { appliance_type: 'dishwasher', name: 'DW', volts: 120, amps: '8.00' },
    ]);
  });

  it('refuses volts other than 120 or 240, amps not above 0, a blank name, a bad type and a type listed twice', async () => {
    for (const bad of [
      [row('dishwasher', 'Dishwasher', 208, 10)],
      [row('dishwasher', 'Dishwasher', 120, 0)],
      [row('dishwasher', 'Dishwasher', 120, -1)],
      [row('dishwasher', '  ', 120, 10)],
      [row('Dish Washer', 'Dishwasher', 120, 10)],
      [row('dishwasher', 'A', 120, 10), row('dishwasher', 'B', 120, 11)],
      [{ appliance_type: 'dishwasher', name: 'Dishwasher', volts: '120', amps: 10 }],
      [row('dishwasher', 'Dishwasher', 120.5, 10)],
      { rows: [] },
    ]) {
      const r = await save(owner, bad);
      expect(r.error?.code, JSON.stringify(bad)).toBe('22023');
    }
    expect((await stored(tenantA)).map((x) => x.amps)).toEqual(['12.00', '22.50']);
  });

  it('an empty list removes every row', async () => {
    const r = await save(ownerB, []);
    expect(r.data).toEqual([{ tenant_id: tenantB, changed: ['dishwasher'] }]);
    expect(await stored(tenantB)).toEqual([]);
  });
});
