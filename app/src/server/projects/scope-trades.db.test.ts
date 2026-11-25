// EZD-739 (AC-EZD-739-1, -2; Q-0764; Q-0779; CLAUDE.md rule 4). Expected values: the migration header
// (20261120150000_add_project_scope_trades.sql) and vault/build/assumptions.md EZD-739: project.scope_trades holds
// the ticked boxes ('electrical', 'plumbing', 'mechanical', 'rcp', in that order), none ticked on a new project;
// create_project and create_project_with_objects take p_scope_trades; update_project_settings takes the
// scope_trades key with Edit model like the scope text, no lock. Another company's project reads as not found.
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

describe('EZD-739 project.scope_trades', () => {
  let tenantA = '';
  let editor: Session; // edit_model, create_projects
  let clientOnly: Session; // create_projects only (client changes, not details)
  let ownerB: Session; // another company, every permission used here

  const trades = async (id: string) =>
    (await harnessSql()`select scope_trades from public.project where id = ${id}::uuid`)[0]
      .scope_trades as string[];
  const create = async (s: Session, name: string, scopeTrades?: string[]) =>
    s.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '1 Test St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
      ...(scopeTrades ? { p_scope_trades: scopeTrades } : {}),
    });
  const created = async (s: Session, name: string, scopeTrades?: string[]) => {
    const r = await create(s, name, scopeTrades);
    expect(r.error).toBeNull();
    return (r.data as { project_id: string }[])[0].project_id;
  };
  const update = (s: Session, project: string, changes: unknown) =>
    s.serverDb.rpc('update_project_settings', { p_project: project, p_changes: changes as never });

  beforeAll(async () => {
    tenantA = await createTenant();
    const tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects', 'create_projects']);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, [
      'view_projects',
      'edit_model',
      'create_projects',
      'settings_company',
    ]);
    editor = await signIn(m1.email);
    clientOnly = await signIn(m2.email);
    ownerB = await signIn(m3.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-1: a new project has the four boxes unticked', async () => {
    const p = await created(editor, 'None ticked');
    expect(await trades(p)).toEqual([]);
  });

  it('AC-2: boxes ticked in the wizard are stored on the project, in the fixed order', async () => {
    const p = await created(editor, 'Ticked', ['rcp', 'electrical']);
    expect(await trades(p)).toEqual(['electrical', 'rcp']);
  });

  it('AC-2: the template create stores them too', async () => {
    const r = await editor.serverDb.rpc('create_project_with_objects', {
      p_name: 'Template ticked',
      p_address: '1 Test St',
      p_type: 'bath',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
      p_objects: [
        {
          id: '7a39b1d2-0c1e-4a43-9a8e-3b1f0c2d4e51',
          type: 'room',
          schema_version: 1,
          data: { name: 'Bath', points: [] },
        },
      ],
      p_scope_trades: ['plumbing'],
    });
    expect(r.error).toBeNull();
    const p = (r.data as { project_id: string }[])[0].project_id;
    expect(await trades(p)).toEqual(['plumbing']);
  });

  it('an unknown value or a repeat is refused at create (22023)', async () => {
    const bad = await create(editor, 'Bad', ['hvac']);
    expect(bad.error?.code).toBe('22023');
    const twice = await create(editor, 'Twice', ['plumbing', 'plumbing']);
    expect(twice.error?.code).toBe('22023');
  });

  it('AC-2: Project settings saves the ticked set and reports scope_trades; the same set again changes nothing', async () => {
    const p = await created(editor, 'Settings');
    const r = await update(editor, p, { scope_trades: ['mechanical', 'electrical', 'plumbing', 'rcp'] });
    expect(r.error).toBeNull();
    expect(r.data as Answer).toEqual({ status: 'saved', tenant_id: tenantA, changed: ['scope_trades'] });
    expect(await trades(p)).toEqual(['electrical', 'plumbing', 'mechanical', 'rcp']);

    const again = await update(editor, p, { scope_trades: ['rcp', 'mechanical', 'plumbing', 'electrical'] });
    expect(again.data as Answer).toEqual({ status: 'saved', tenant_id: tenantA, changed: [] });

    const cleared = await update(editor, p, { scope_trades: [] });
    expect(cleared.data as Answer).toEqual({ status: 'saved', tenant_id: tenantA, changed: ['scope_trades'] });
    expect(await trades(p)).toEqual([]);
  });

  it('a bad value in the save is refused (22023) and nothing changes', async () => {
    const p = await created(editor, 'Bad save', ['electrical']);
    for (const value of [['gas'], 'electrical', [1], ['rcp', 'rcp']]) {
      const r = await update(editor, p, { scope_trades: value });
      expect(r.error?.code).toBe('22023');
    }
    expect(await trades(p)).toEqual(['electrical']);
  });

  it('without Edit model the boxes cannot be changed (42501)', async () => {
    const p = await created(editor, 'No edit');
    const r = await update(clientOnly, p, { scope_trades: ['plumbing'] });
    expect(r.error?.code).toBe('42501');
    expect(await trades(p)).toEqual([]);
  });

  it("rule 4: another company cannot read or change a project's boxes", async () => {
    const p = await created(editor, 'Company A', ['electrical']);
    const r = await update(ownerB, p, { scope_trades: ['plumbing'] });
    expect(r.error?.code).toBe('P0002');
    const read = await ownerB.serverDb.from('project').select('scope_trades').eq('id', p);
    expect(read.data ?? []).toEqual([]);
    const direct = await ownerB.serverDb.from('project').update({ scope_trades: ['rcp'] }).eq('id', p).select('id');
    expect(direct.data ?? []).toEqual([]);
    expect(await trades(p)).toEqual(['electrical']);
  });
});
