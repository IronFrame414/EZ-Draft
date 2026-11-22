// EZD-711 (CLAUDE.md rule 4; S13 Decision 9 "Property appraiser import needs Edit model"; migration
// 20261122180000_property_record_import.sql): set_property_record, the only member write of property_record. One
// company cannot read or change another company's record through it; a member needs Edit model and a project in
// scope; direct writes stay refused.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

const args = (project: string, owner: string) => ({
  p_project: project,
  p_parcel_no: '00-43-44-21-01-000-0010',
  p_owner: owner,
  p_legal_description: null as unknown as string,
  p_year_built: 1975,
  p_living_area: null as unknown as number,
  p_source_url: null as unknown as string,
});

describe('EZD-711 set_property_record company isolation', () => {
  let tenantA = '';
  let tenantB = '';
  let a1 = '';
  let a2 = '';
  let b1 = '';
  let bRecord = '';
  let aS: Session;
  let bS: Session;
  let viewerS: Session;
  let listedS: Session;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [a1, a2] = await createProjects(tenantA, 2);
    [b1] = await createProjects(tenantB, 1);
    const a = await createMember({ tenantId: tenantA, scope: 'all' });
    const b = await createMember({ tenantId: tenantB, scope: 'all' });
    const viewer = await createMember({ tenantId: tenantA, scope: 'all' });
    const listed = await createMember({ tenantId: tenantA, scope: 'listed', listed: [a1] });
    await setPermissions(tenantA, a.membershipId, ['view_projects', 'edit_model']);
    await setPermissions(tenantB, b.membershipId, ['view_projects', 'edit_model']);
    await setPermissions(tenantA, viewer.membershipId, ['view_projects']);
    await setPermissions(tenantA, listed.membershipId, ['view_projects', 'edit_model']);
    aS = await signIn(a.email);
    bS = await signIn(b.email);
    viewerS = await signIn(viewer.email);
    listedS = await signIn(listed.email);
    const saved = await bS.serverDb.rpc('set_property_record', args(b1, 'B owner'));
    expect(saved.error).toBeNull();
    bRecord = saved.data as string;
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('a member of company A cannot write a record onto company B project', async () => {
    const res = await aS.serverDb.rpc('set_property_record', args(b1, 'A was here'));
    expect(res.error?.code).toBe('P0002');
    const row = await adminDb().from('property_record').select('owner, tenant_id').eq('id', bRecord).single();
    expect(row.data).toEqual({ owner: 'B owner', tenant_id: tenantB });
  });

  it('company A cannot read company B record', async () => {
    const res = await aS.serverDb.from('property_record').select('id').eq('id', bRecord);
    expect(res.data).toEqual([]);
  });

  it("a project pointing at another company's record gets a new record of its own company", async () => {
    await adminDb().from('project').update({ property_record_id: bRecord }).eq('id', a2);
    const res = await aS.serverDb.rpc('set_property_record', args(a2, 'A owner'));
    expect(res.error).toBeNull();
    expect(res.data).not.toBe(bRecord);
    const mine = await adminDb().from('property_record').select('tenant_id, owner').eq('id', res.data as string).single();
    expect(mine.data).toEqual({ tenant_id: tenantA, owner: 'A owner' });
    const theirs = await adminDb().from('property_record').select('owner').eq('id', bRecord).single();
    expect(theirs.data?.owner).toBe('B owner');
  });

  it('needs Edit model', async () => {
    const res = await viewerS.serverDb.rpc('set_property_record', args(a1, 'Viewer'));
    expect(res.error?.code).toBe('42501');
  });

  it('a listed member writes only projects in scope', async () => {
    expect((await listedS.serverDb.rpc('set_property_record', args(a2, 'Out'))).error?.code).toBe('P0002');
    expect((await listedS.serverDb.rpc('set_property_record', args(a1, 'In'))).error).toBeNull();
  });

  it('an unknown project and values outside the column limits are refused', async () => {
    expect((await aS.serverDb.rpc('set_property_record', args(randomUUID(), 'X'))).error?.code).toBe('P0002');
    const bad = await aS.serverDb.rpc('set_property_record', { ...args(a1, 'X'), p_year_built: 1500 });
    expect(bad.error?.code).toBe('22023');
  });

  it('direct member writes stay refused', async () => {
    const ins = await aS.serverDb.from('property_record').insert({ tenant_id: tenantA, owner: 'X' });
    expect(ins.error?.code).toBe('42501');
  });
});
