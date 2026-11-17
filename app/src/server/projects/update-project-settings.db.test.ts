// EZD-130 (AC-EZD-130-1, -2, -3, -4, -5; CLAUDE.md rule 4). Expected values: the migration header
// (20261116190000_create_update_project_settings.sql) and Q-0697 decisions 10 (name, address, scope of work need
// Edit model; type and the copied defaults also need the lock, checked by epoch in the function; the client needs
// Company settings or Create projects); 09o Copy at creation rows 1-2 (tile waste 10% kept after the company goes
// to 12%; 15% on P changes only P); Q-0399 (nothing stored for code edition or submittal profile). Calls go
// through the gated serverDb of `signIn`, as the route does.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

type Answer = { status: string; tenant_id?: string; changed?: string[] };

describe('EZD-130 update_project_settings', () => {
  let tenantA = '';
  let tenantB = '';
  let editor: Session; // edit_model, create_projects, settings_defaults
  let editorId = '';
  let other: Session; // edit_model only
  let otherId = '';
  let viewer: Session; // view_projects only
  let scoped: Session; // edit_model, listed scope with no projects
  let ownerB: Session; // another company, every permission used here
  let customerA = '';
  let archivedA = '';
  let customerB = '';

  const call = (s: Session, project: string, changes: unknown, epoch?: number) =>
    s.serverDb.rpc('update_project_settings', {
      p_project: project,
      p_changes: changes as never,
      ...(epoch === undefined ? {} : { p_lock_epoch: epoch }),
    });
  const acquire = async (s: Session, project: string): Promise<number> => {
    const r = await s.serverDb.rpc('acquire_edit_lock', {
      p_project: project,
      p_device_id: 'device-ezd130',
    });
    expect(r.error).toBeNull();
    const epoch = (r.data as { lock_epoch?: number }).lock_epoch;
    expect(typeof epoch).toBe('number');
    return epoch as number;
  };
  const release = (s: Session, project: string) =>
    s.serverDb.rpc('release_edit_lock', { p_project: project, p_reason: 'stop_editing' });
  const row = async (id: string) =>
    (
      await harnessSql()`select name, address, scope_of_work, type, customer_id, settings, code_edition,
        submittal_profile_id, updated_at from public.project where id = ${id}::uuid`
    )[0];
  const tenantDefaults = async (id: string) =>
    (await harnessSql()`select defaults from public.tenant where id = ${id}::uuid`)[0].defaults;
  const create = async (s: Session, name: string, defaults: Record<string, number> | null) => {
    const r = await s.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '1 Test St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
      ...(defaults ? { p_defaults: defaults } : {}),
    });
    expect(r.error).toBeNull();
    return (r.data as { project_id: string }[])[0].project_id;
  };

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, [
      'view_projects',
      'edit_model',
      'create_projects',
      'settings_defaults',
    ]);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects', 'edit_model']);
    const m3 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m3.membershipId, ['view_projects']);
    const m4 = await createMember({ tenantId: tenantA, scope: 'listed' });
    await setPermissions(tenantA, m4.membershipId, ['view_projects', 'edit_model']);
    const m5 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m5.membershipId, [
      'view_projects',
      'edit_model',
      'create_projects',
      'settings_company',
    ]);
    editor = await signIn(m1.email);
    editorId = m1.appUserId;
    other = await signIn(m2.email);
    otherId = m2.appUserId;
    viewer = await signIn(m3.email);
    scoped = await signIn(m4.email);
    ownerB = await signIn(m5.email);
    customerA = (
      await harnessSql()`insert into public.customer (tenant_id, name, email)
        values (${tenantA}::uuid, 'Ann Lee', 'ann@example.com') returning id`
    )[0].id as string;
    archivedA = (
      await harnessSql()`insert into public.customer (tenant_id, name, email, archived_at)
        values (${tenantA}::uuid, 'Old Co', 'old@example.com', now()) returning id`
    )[0].id as string;
    customerB = (
      await harnessSql()`insert into public.customer (tenant_id, name, email)
        values (${tenantB}::uuid, 'Bea Ruiz', 'bea@example.com') returning id`
    )[0].id as string;
    expect(editorId).not.toBe(otherId);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-1/AC-2: a copied value stays after a company change; a project save changes only that project', async () => {
    await editor.serverDb.rpc('update_tenant_defaults', { p_set: { waste_tile: 10 }, p_remove: [] });
    const p = await create(editor, 'Copy P', { waste_tile: 10 });
    const q = await create(editor, 'Copy Q', { waste_tile: 10 });
    await editor.serverDb.rpc('update_tenant_defaults', { p_set: { waste_tile: 12 }, p_remove: [] });
    expect((await row(p)).settings).toEqual({ defaults: { waste_tile: 10 } });

    const epoch = await acquire(editor, p);
    const r = await call(editor, p, { defaults: { waste_tile: 15 } }, epoch);
    expect(r.error).toBeNull();
    expect(r.data as Answer).toEqual({ status: 'saved', tenant_id: tenantA, changed: ['waste_tile'] });
    expect((await row(p)).settings).toEqual({ defaults: { waste_tile: 15 } });
    expect((await row(q)).settings).toEqual({ defaults: { waste_tile: 10 } });
    expect(await tenantDefaults(tenantA)).toEqual({ waste_tile: 12 });
    await release(editor, p);
  });

  it('AC-2: the merge keeps the other keys of settings (plan_scale) and of the copy', async () => {
    const p = await create(editor, 'Merge', { waste_tile: 10, overhang_standard: 1.5 });
    await editor.serverDb.rpc('set_plan_scale', { p_project: p, p_scale: 0.5 });
    const epoch = await acquire(editor, p);
    const r = await call(editor, p, { defaults: { waste_lvp: 7 } }, epoch);
    expect((r.data as Answer).changed).toEqual(['waste_lvp']);
    expect((await row(p)).settings).toEqual({
      plan_scale: 0.5,
      defaults: { waste_tile: 10, overhang_standard: 1.5, waste_lvp: 7 },
    });
    await release(editor, p);
  });

  it('AC-3: name, address and scope of work save with Edit model and no lock', async () => {
    const p = await create(editor, 'Details', null);
    const r = await call(other, p, { name: '  Smith kitchen ', address: '2 Oak Ave', scope_of_work: 'Demo' });
    expect(r.error).toBeNull();
    expect((r.data as Answer).changed).toEqual(['address', 'name', 'scope_of_work']);
    const after = await row(p);
    expect([after.name, after.address, after.scope_of_work]).toEqual(['Smith kitchen', '2 Oak Ave', 'Demo']);

    // nothing changed: no write
    const before = after.updated_at;
    const same = await call(other, p, { name: 'Smith kitchen' });
    expect((same.data as Answer).changed).toEqual([]);
    expect((await row(p)).updated_at).toEqual(before);

    // an empty scope of work is stored as none
    await call(other, p, { scope_of_work: '  ' });
    expect((await row(p)).scope_of_work).toBeNull();
  });

  it('AC-3: type and defaults need the lock with its epoch; the whole save is refused otherwise', async () => {
    const p = await create(editor, 'Locked', { waste_tile: 10 });
    // never locked, no epoch
    let r = await call(other, p, { type: 'bath', name: 'Mixed' });
    expect(r.data as Answer).toEqual({ status: 'stale_lock_epoch' });
    expect((await row(p)).type).toBe('kitchen');
    expect((await row(p)).name).toBe('Locked');

    // the lock held by someone else
    const epoch = await acquire(editor, p);
    r = await call(other, p, { type: 'bath' }, epoch);
    expect(r.data as Answer).toEqual({ status: 'stale_lock_epoch' });
    r = await call(other, p, { defaults: { waste_tile: 11 } }, epoch);
    expect(r.data as Answer).toEqual({ status: 'stale_lock_epoch' });

    // the holder with a stale epoch, then with the right one
    r = await call(editor, p, { type: 'bath' }, epoch - 1);
    expect(r.data as Answer).toEqual({ status: 'stale_lock_epoch' });
    r = await call(editor, p, { type: 'bath' });
    expect(r.data as Answer).toEqual({ status: 'stale_lock_epoch' });
    expect((await row(p)).type).toBe('kitchen');
    r = await call(editor, p, { type: 'bath', name: 'Mixed' }, epoch);
    expect(r.data as Answer).toEqual({ status: 'saved', tenant_id: tenantA, changed: ['name', 'type'] });
    expect((await row(p)).type).toBe('bath');

    // released: the old epoch is refused
    await release(editor, p);
    r = await call(editor, p, { type: 'kitchen' }, epoch);
    expect(r.data as Answer).toEqual({ status: 'stale_lock_epoch' });
    // an unchanged type needs no lock
    r = await call(other, p, { type: 'bath', name: 'Mixed 2' });
    expect((r.data as Answer).changed).toEqual(['name']);
  });

  it('AC-3: no Edit model, out of scope or another company is refused and nothing changes', async () => {
    const p = await create(editor, 'Guarded', null);
    expect((await call(viewer, p, { name: 'X' })).error?.code).toBe('42501');
    expect((await call(scoped, p, { name: 'X' })).error?.code).toBe('P0002');
    expect((await call(ownerB, p, { name: 'X' })).error?.code).toBe('P0002');
    expect((await row(p)).name).toBe('Guarded');
    // another company's member cannot read the row either
    const read = await ownerB.serverDb.from('project').select('id').eq('id', p);
    expect(read.data ?? []).toEqual([]);
  });

  it('AC-4: a client change needs Company settings or Create projects and an active customer of the company', async () => {
    const p = await create(editor, 'Client', null);
    expect((await call(other, p, { customer_id: customerA })).error?.code).toBe('42501');
    expect((await row(p)).customer_id).toBeNull();
    // a mixed save is refused whole
    expect((await call(other, p, { name: 'Y', customer_id: customerA })).error?.code).toBe('42501');
    expect((await row(p)).name).toBe('Client');

    const archived = await call(editor, p, { customer_id: archivedA });
    expect([archived.error?.code, archived.error?.message]).toEqual(['22023', 'customer_unavailable']);
    const foreign = await call(editor, p, { customer_id: customerB });
    expect([foreign.error?.code, foreign.error?.message]).toEqual(['22023', 'customer_unavailable']);

    const ok = await call(editor, p, { customer_id: customerA });
    expect((ok.data as Answer).changed).toEqual(['customer_id']);
    expect((await row(p)).customer_id).toBe(customerA);
    // the same client again is no change and needs no client permission
    expect(((await call(other, p, { customer_id: customerA })).data as Answer).changed).toEqual([]);
    // cleared
    expect(((await call(editor, p, { customer_id: null })).data as Answer).changed).toEqual(['customer_id']);
    expect((await row(p)).customer_id).toBeNull();
  });

  it('AC-5: code edition, submittal profile and other keys are refused; nothing is stored for them', async () => {
    const p = await create(editor, 'Hidden', null);
    const epoch = await acquire(editor, p);
    for (const bad of [
      { code_edition: 'FBC 2023' },
      { submittal_profile_id: '00000000-0000-4000-8000-000000000000' },
      { name: '' },
      { address: '   ' },
      { type: 'garage' },
      { customer_id: 'nope' },
      { defaults: { pattern_straight: 5 } },
      { defaults: { waste_tile: '10' } },
      { defaults: { waste_tile: -1 } },
      [1],
    ]) {
      const r = await call(editor, p, bad, epoch);
      expect(r.error?.code, JSON.stringify(bad)).toBe('22023');
    }
    const after = await row(p);
    expect([after.code_edition, after.submittal_profile_id, after.settings]).toEqual([null, null, {}]);
    await release(editor, p);
  });
});
