// EZD-720 (AC-EZD-720-1 "Switching to the Client set shows the countertop sheets"; AC-EZD-720-2 "the Permit set never
// contains them"): the set selector query (loadProjectSheetSets) gives the client set A8.0 Countertop plan and A9.0
// Edge details while the project has a live countertop piece and takes them away with the last one; the permit set
// never has them. Expected sets: vault/build/assumptions/EZD-720.md Settled, S13 Decisions 1 and 10. The pieces are
// EZD-418's board tops (editor/countertops/test-fixture.ts). No new table or policy: the pieces are read under
// model_object's RLS, so another company's read is proved here too (CLAUDE.md rule 4).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
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
import { boardPiecesModel } from '../../editor/countertops/test-fixture';
import { loadProjectSheetSets } from './sheets';

const NINE = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];

describe('EZD-720 client set countertop sheets', () => {
  let editor: Session;
  let ownerB: Session;

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
  const acquire = async (s: Session, project: string) => {
    const r = await s.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-a' });
    expect(r.error).toBeNull();
    return Number((r.data as { lock_epoch: number }).lock_epoch);
  };
  // The board's three tops on the project's own floor, under fresh ids (kept per project for the delete).
  const ids = new Map<string, string[]>();
  const save = async (s: Session, project: string, epoch: number, deleted: boolean) => {
    const [floor] = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor' limit 1`;
    const pieces = [...boardPiecesModel().values()].filter((v) => v.type === 'countertop_piece');
    if (!ids.has(project)) ids.set(project, pieces.map(() => randomUUID()));
    // A delete names only the object and the seq it saw (save_objects).
    const changes = pieces.map((v, i) =>
      deleted
        ? { id: ids.get(project)![i]!, base_seq: 1, deleted }
        : {
            id: ids.get(project)![i]!,
            base_seq: 0,
            deleted,
            type: v.type,
            schema_version: CURRENT_SCHEMA_VERSION,
            data: { ...(v.data as Record<string, unknown>), level: floor!.object_id },
          },
    );
    const r = await s.serverDb.rpc('save_objects', { p_project: project, p_lock_epoch: epoch, p_changes: changes });
    expect(r.error).toBeNull();
    expect((r.data as { status: string }).status).toBe('saved');
  };
  const numbers = async (s: Session, project: string) =>
    (await loadProjectSheetSets(s.serverDb, project))?.map((x) => [x.kind, x.sheets.map((y) => y.number)]) ?? null;

  beforeAll(async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    const m2 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m2.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    editor = await signIn(m1.email);
    ownerB = await signIn(m2.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-1, AC-2: the countertop sheets join the client set with the pieces and leave with the last; never the permit set', async () => {
    const p = await created(editor, 'Client set countertops');
    expect(await numbers(editor, p)).toEqual([
      ['permit', NINE],
      ['client', ['R1.0']],
    ]);

    const epoch = await acquire(editor, p);
    await save(editor, p, epoch, false);
    const sets = await loadProjectSheetSets(editor.serverDb, p);
    expect(sets?.map((x) => [x.kind, x.sheets.map((y) => y.number)])).toEqual([
      ['permit', NINE],
      ['client', ['A8.0', 'A9.0', 'R1.0']],
    ]);
    expect(sets?.[1].sheets.slice(0, 2).map((s) => [s.number, s.title])).toEqual([
      ['A8.0', 'Countertop plan'],
      ['A9.0', 'Edge details'],
    ]);

    await save(editor, p, epoch, true);
    expect(await numbers(editor, p)).toEqual([
      ['permit', NINE],
      ['client', ['R1.0']],
    ]);
  });

  it("another company reads no sets of the project, so none of its countertop sheets", async () => {
    const p = await created(editor, 'Client set countertops RLS');
    const epoch = await acquire(editor, p);
    await save(editor, p, epoch, false);
    expect(await loadProjectSheetSets(ownerB.serverDb, p)).toBeNull();
  });
});
