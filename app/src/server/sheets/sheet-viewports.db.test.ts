// EZD-703 (03b rule 3 "viewports ... are model objects"; S13 Rail: Viewport "set scale per viewport"; 03c sheet
// "viewports, scale"): a permit set carrying its viewports is saved through save_objects as any sheet_set object, and
// the set selector query returns them; a set with no stored viewports returns null (the defaults). No new table or
// policy: model_object's RLS covers the rows (sheet-sets.db.test.ts proves another company cannot read or change them).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { loadProjectSheetSets } from './sheets';

describe('EZD-703 stored viewports', () => {
  let editor: Session;
  let other: Session;

  beforeAll(async () => {
    const tenant = await createTenant();
    const tenantB = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    const mb = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, mb.membershipId, ['view_projects', 'edit_model']);
    editor = await signIn(m.email);
    other = await signIn(mb.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('saves a permit set with its viewports and reads them back; another company reads nothing', async () => {
    const made = await editor.serverDb.rpc('create_project', {
      p_name: 'Viewports',
      p_address: '1 Test St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    expect(made.error).toBeNull();
    const project = (made.data as { project_id: string }[])[0]!.project_id;

    const before = await loadProjectSheetSets(editor.serverDb, project);
    expect(before?.map((s) => s.viewports)).toEqual([null, null]);

    const lock = await editor.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-a' });
    expect(lock.error).toBeNull();
    const viewports = [
      { id: randomUUID(), sheet: 'A1.0', kind: 'plan', level: null, view: 'existing', scale: '1/2' },
      { id: randomUUID(), sheet: 'A2.0', kind: 'plan', level: null, view: 'demo', scale: '1/4' },
    ];
    const setId = randomUUID();
    const saved = await editor.serverDb.rpc('save_objects', {
      p_project: project,
      p_lock_epoch: Number((lock.data as { lock_epoch: number }).lock_epoch),
      p_changes: [
        {
          id: setId,
          base_seq: 0,
          deleted: false,
          type: 'sheet_set',
          schema_version: CURRENT_SCHEMA_VERSION,
          data: {
            kind: 'permit',
            sheetIds: [],
            size: '24x36',
            keyPlacement: 'every_sheet',
            submittalProfileId: null,
            lastIssuedVersionId: null,
            viewports,
            viewportSheets: ['A1.0', 'A2.0'],
          },
        },
      ],
    });
    expect(saved.error).toBeNull();
    expect((saved.data as { status: string }).status).toBe('saved');

    const after = await loadProjectSheetSets(editor.serverDb, project);
    expect(after?.map((s) => [s.kind, s.id, s.viewports, s.viewportSheets])).toEqual([
      ['permit', setId, viewports, ['A1.0', 'A2.0']],
      ['client', null, null, null],
    ]);
    expect(await loadProjectSheetSets(other.serverDb, project)).toBeNull();
  });

  it('Q-0509 a second floor adds its floor-plan sheets to the permit set', async () => {
    const made = await editor.serverDb.rpc('create_project', {
      p_name: 'Two floors',
      p_address: '1 Test St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    expect(made.error).toBeNull();
    const project = (made.data as { project_id: string }[])[0]!.project_id;
    const lock = await editor.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-a' });
    expect(lock.error).toBeNull();
    const saved = await editor.serverDb.rpc('save_objects', {
      p_project: project,
      p_lock_epoch: Number((lock.data as { lock_epoch: number }).lock_epoch),
      p_changes: [
        {
          id: randomUUID(),
          base_seq: 0,
          deleted: false,
          type: 'floor',
          schema_version: CURRENT_SCHEMA_VERSION,
          data: { name: 'Second floor', order: 2 },
        },
      ],
    });
    expect(saved.error).toBeNull();
    const sets = await loadProjectSheetSets(editor.serverDb, project);
    expect(sets?.[0]?.sheets.map((s) => s.number)).toEqual([
      'A0.0', 'A1.0', 'A1.1', 'A2.0', 'A2.1', 'A3.0', 'A3.1', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0',
    ]);
    expect(sets?.[0]?.sheets.find((s) => s.number === 'A1.1')?.title).toBe('Existing · Second floor');
    expect(sets?.[1]?.sheets.map((s) => s.number)).toEqual(['R1.0']);
  });
});
