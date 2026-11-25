// EZD-726 (AC-EZD-726-1; 03b Architecture rule 3; 03d sheet_set; CLAUDE.md rule 4): a new project has exactly one
// permit set and one client set, and the set selector query returns each set's sheets. A set is a sheet_set model
// object, saved and versioned with the model; one never changed is the default and is not stored. Expected values: 03d sheet_set ("One permit set and one client set per
// project"; permit 24x36, client 11x17 or 24x36), the S13 size toggle (11x17 for client copies), S13 Decision 8
// (key placement), S13 Decision 1 and Q-0779 (permit sheets), S13 Decision 10 (client set: R1.0). No new table:
// the sets are read under model_object's RLS, so another company's read is proved here.
import { CURRENT_SCHEMA_VERSION, parseModelDocument } from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
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
import { buildTemplateObjects } from '../projects/template-objects';
import { loadProjectSheetSets } from './sheets';

const NINE = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
// The EZD-221a test's L-kitchen template (create-project-with-objects.db.test.ts).
const L_KITCHEN_108 = { key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 108 } as const;
const TEN = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0', 'E1.0', 'E2.0', 'R1.0'];

const setData = (kind: string, size: string) => ({
  kind,
  sheetIds: [],
  size,
  keyPlacement: 'every_sheet',
  submittalProfileId: null,
  lastIssuedVersionId: null,
});

describe('EZD-726 sheet sets', () => {
  let tenantA = '';
  let editor: Session;
  let ownerB: Session;
  let listedOther: Session;
  let projectB = '';

  const created = async (s: Session, name: string) => {
    const r = await s.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '1 Test St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    expect(r.error).toBeNull();
    return (r.data as { project_id: string }[])[0].project_id;
  };
  const storedSets = async (project: string) =>
    harnessSql()<{ object_id: string; deleted: boolean; data: unknown }[]>`
      select object_id, deleted, data from public.model_object
      where project_id = ${project}::uuid and type = 'sheet_set' order by data ->> 'kind'`;
  const acquire = async (s: Session, project: string) => {
    const r = await s.serverDb.rpc('acquire_edit_lock', {
      p_project: project,
      p_device_id: 'dev-a',
    });
    expect(r.error).toBeNull();
    return Number((r.data as { lock_epoch: number }).lock_epoch);
  };
  const saveSet = (s: Session, project: string, epoch: number, id: string, data: unknown) =>
    s.serverDb.rpc('save_objects', {
      p_project: project,
      p_lock_epoch: epoch,
      p_changes: [
        {
          id,
          base_seq: 0,
          deleted: false,
          type: 'sheet_set',
          schema_version: CURRENT_SCHEMA_VERSION,
          data,
        },
      ],
    });
  const summary = async (s: Session, project: string) =>
    (await loadProjectSheetSets(s.serverDb, project))?.map((x) => [
      x.id,
      x.kind,
      x.size,
      x.keyPlacement,
    ]) ?? null;

  beforeAll(async () => {
    tenantA = await createTenant();
    const tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, [
      'view_projects',
      'edit_model',
      'create_projects',
    ]);
    const m2 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m2.membershipId, [
      'view_projects',
      'edit_model',
      'create_projects',
    ]);
    const [other] = await createProjects(tenantA, 1);
    const m3 = await createMember({ tenantId: tenantA, scope: 'listed', listed: [other] });
    await setPermissions(tenantA, m3.membershipId, ['view_projects']);
    editor = await signIn(m1.email);
    ownerB = await signIn(m2.email);
    listedOther = await signIn(m3.email);
    projectB = await created(ownerB, 'Sheet sets company B');
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-1: a new project has exactly one permit set and one client set, each with its sheets', async () => {
    const p = await created(editor, 'Sheet sets new');
    const sets = await loadProjectSheetSets(editor.serverDb, p);
    expect(sets?.map((s) => [s.id, s.kind, s.size, s.keyPlacement, s.lastIssuedVersionId])).toEqual(
      [
        [null, 'permit', '24x36', 'every_sheet', null],
        [null, 'client', '11x17', 'every_sheet', null],
      ],
    );
    expect(sets?.[0].sheets.map((s) => s.number)).toEqual(NINE);
    expect(sets?.[1].sheets.map((s) => [s.number, s.title])).toEqual([
      ['R1.0', 'Finish schedule + renders'],
    ]);

    const r = await editor.serverDb.rpc('update_project_settings', {
      p_project: p,
      p_changes: { scope_trades: ['rcp'] },
    });
    expect(r.error).toBeNull();
    const after = await loadProjectSheetSets(editor.serverDb, p);
    expect(after?.[0].sheets.map((s) => s.number)).toEqual(TEN);
    expect(after?.[1].sheets.map((s) => s.number)).toEqual(['R1.0']);
  });

  it('AC-1: a project made another way (template, or a plain insert) also has exactly the two sets', async () => {
    const r = await editor.serverDb.rpc('create_project_with_objects', {
      p_name: 'Sheet sets template',
      p_address: '1 Test St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
      p_objects: buildTemplateObjects({ ...L_KITCHEN_108 }),
    });
    expect(r.error).toBeNull();
    const p = (r.data as { project_id: string }[])[0].project_id;
    const [plain] = await createProjects(tenantA, 1);
    for (const project of [p, plain]) {
      expect(await summary(editor, project)).toEqual([
        [null, 'permit', '24x36', 'every_sheet'],
        [null, 'client', '11x17', 'every_sheet'],
      ]);
    }
  });

  it('a changed set is a model object: saved with no floor, read by the selector, held in the checkpoint', async () => {
    const p = await created(editor, 'Sheet sets stored');
    const epoch = await acquire(editor, p);
    const id = randomUUID();
    const data = { ...setData('client', '24x36'), keyPlacement: 'cover_only' };
    const saved = await saveSet(editor, p, epoch, id, data);
    expect(saved.error).toBeNull();
    expect((saved.data as { status: string }).status).toBe('saved');
    expect((await storedSets(p)).map((r) => [r.object_id, r.deleted, r.data])).toEqual([
      [id, false, data],
    ]);

    // Still exactly one of each: the stored client set replaces the default, the permit set stays the default.
    expect(await summary(editor, p)).toEqual([
      [null, 'permit', '24x36', 'every_sheet'],
      [id, 'client', '24x36', 'cover_only'],
    ]);

    const made = await editor.serverDb.rpc('create_checkpoint', { p_project: p });
    expect(made.error).toBeNull();
    const [v] = await harnessSql()<
      { model_json: { objects: { id: string; type: string; data: unknown }[] } }[]
    >`
      select model_json from public.model_version where id = ${made.data as string}::uuid`;
    expect(
      v.model_json.objects.filter((o) => o.type === 'sheet_set').map((o) => [o.id, o.data]),
    ).toEqual([[id, data]]);
    expect(parseModelDocument(v.model_json).ok).toBe(true);
  });

  it('a second stored set of one kind does not make a second set; an object that does not parse is passed over', async () => {
    const p = await created(editor, 'Sheet sets doubles');
    const epoch = await acquire(editor, p);
    const [low, high] = [randomUUID(), randomUUID()].sort();
    expect((await saveSet(editor, p, epoch, high, setData('permit', '24x36'))).error).toBeNull();
    expect(
      (
        await saveSet(editor, p, epoch, low, {
          ...setData('permit', '24x36'),
          keyPlacement: 'cover_only',
        })
      ).error,
    ).toBeNull();
    // 8.5x11 is not a client size (03d: client 11x17 or 24x36), so that object is passed over and the default
    // client set stands.
    expect(
      (await saveSet(editor, p, epoch, randomUUID(), setData('client', '8.5x11'))).error,
    ).toBeNull();
    expect(await summary(editor, p)).toEqual([
      [low, 'permit', '24x36', 'cover_only'],
      [null, 'client', '11x17', 'every_sheet'],
    ]);
  });

  it("another company cannot read a company's sets; a listed member sees only listed projects", async () => {
    const p = await created(editor, 'Sheet sets isolation');
    const epoch = await acquire(editor, p);
    const id = randomUUID();
    expect((await saveSet(editor, p, epoch, id, setData('client', '24x36'))).error).toBeNull();

    expect(await loadProjectSheetSets(ownerB.serverDb, p)).toBeNull();
    expect(await loadProjectSheetSets(listedOther.serverDb, p)).toBeNull();
    for (const s of [ownerB, listedOther]) {
      const read = await s.serverDb
        .from('model_object')
        .select('object_id')
        .eq('project_id', p)
        .eq('type', 'sheet_set');
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
    }
    // Each company reads its own.
    expect(await summary(editor, p)).toEqual([
      [null, 'permit', '24x36', 'every_sheet'],
      [id, 'client', '24x36', 'every_sheet'],
    ]);
    expect(await summary(ownerB, projectB)).toEqual([
      [null, 'permit', '24x36', 'every_sheet'],
      [null, 'client', '11x17', 'every_sheet'],
    ]);
  });

  it("another company cannot change a company's sets, and no member writes the rows directly", async () => {
    const p = await created(editor, 'Sheet sets writes');
    const epoch = await acquire(editor, p);
    const id = randomUUID();
    const data = setData('client', '24x36');
    expect((await saveSet(editor, p, epoch, id, data)).error).toBeNull();

    // Company B: a save into company A's project is refused, whether it changes the set or adds one.
    const change = await ownerB.serverDb.rpc('save_objects', {
      p_project: p,
      p_lock_epoch: epoch,
      p_changes: [
        {
          id,
          base_seq: 1,
          deleted: true,
          type: 'sheet_set',
          schema_version: CURRENT_SCHEMA_VERSION,
          data,
        },
      ],
    });
    expect(change.error !== null || (change.data as { status: string }).status !== 'saved').toBe(
      true,
    );
    const add = await saveSet(ownerB, p, epoch, randomUUID(), setData('permit', '24x36'));
    expect(add.error !== null || (add.data as { status: string }).status !== 'saved').toBe(true);

    for (const s of [ownerB, editor]) {
      const upd = await s.serverDb
        .from('model_object')
        .update({ deleted: true })
        .eq('project_id', p)
        .eq('type', 'sheet_set')
        .select('object_id');
      expect(upd.data ?? []).toEqual([]);
      const del = await s.serverDb
        .from('model_object')
        .delete()
        .eq('project_id', p)
        .eq('type', 'sheet_set')
        .select('object_id');
      expect(del.data ?? []).toEqual([]);
    }
    expect((await storedSets(p)).map((r) => [r.object_id, r.deleted, r.data])).toEqual([
      [id, false, data],
    ]);
  });
});
