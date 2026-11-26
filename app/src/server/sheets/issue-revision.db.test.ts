// EZD-717 (AC-EZD-717-1 "After Rev 0 the set is locked and edits go to a working copy"). Local database, real
// sign-in, through server/sheets/issue-revision.ts. Expected values from the spec: 09h Revision rules ("Rev 0 = first
// issued permit set, locked; later issues are Rev 1, 2... with no cap. Every sent version is frozen; editing continues
// on a working copy"); S13 Permissions ("Issue Rev 0 permit set: Issue permit sets. Issue Rev 1+: Issue revisions");
// 03c permit_revision (project_id, rev_no, model_version_id, issued_at, issued_by, sent_to, delta_object_ids,
// description) and electrical_calc (model_version_id, case, method, inputs, results; "a row is stored when ... a set
// issues"); 03b rule 7 (a version's model_json never changes); W11 4 (plan_set.issued); W15 / Q-0700 05 (cleanup deletes
// only rows neither named nor sent); Q-0199 (status moved by hand: an issue leaves it).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { readVersionObjects } from '../jobs/handlers/pdf-export';
import { issuePermitSet, loadPermitRevisions } from './issue-revision';
import { loadProjectSheetSets } from './sheets';

const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;
const BASE = ['view_projects', 'create_projects', 'edit_model'] as const;

type Doc = { objects: { id: string; type: string; data: { geometry?: { end?: { x: number } } } }[] };

const issue = (s: Session, projectId: string, extra: Partial<Parameters<typeof issuePermitSet>[1]> = {}) =>
  issuePermitSet(db(s), { projectId, description: null, electrical: null, ip: null, ...extra });

describe('EZD-717 issue Rev 0 and Rev N (database)', () => {
  let tenant = '';
  let full: Session;
  let fullUser = '';
  let rev0Only: Session;
  let revNOnly: Session;
  let viewer: Session;
  const epochs = new Map<string, number>();
  const seqs = new Map<string, number>();

  const created = async (name: string) => {
    const r = await full.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '336 Golfview Rd',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    if (r.error) throw new Error(r.error.message);
    return (r.data as { project_id: string }[])[0].project_id;
  };

  // Saves one wall of the given length (inches) through save_objects, under the edit lock: the working copy.
  const saveWall = async (project: string, wallId: string, length: number) => {
    if (!epochs.has(project)) {
      const lock = await full.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-717' });
      if (lock.error) throw new Error(lock.error.message);
      epochs.set(project, Number((lock.data as { lock_epoch: number }).lock_epoch));
    }
    const floor = await full.serverDb
      .from('model_object')
      .select('object_id')
      .eq('project_id', project)
      .eq('type', 'floor')
      .limit(1)
      .single();
    if (floor.error) throw new Error(floor.error.message);
    const w = createWallData({
      start: { x: 0, y: 0 },
      end: { x: length, y: 0 },
      level: (floor.data as { object_id: string }).object_id,
    });
    if (!w.ok) throw new Error(w.reason);
    const r = await full.serverDb.rpc('save_objects', {
      p_project: project,
      p_lock_epoch: epochs.get(project)!,
      p_changes: [
        {
          id: wallId,
          base_seq: seqs.get(wallId) ?? 0,
          deleted: false,
          type: 'wall',
          schema_version: CURRENT_SCHEMA_VERSION,
          data: w.data,
        },
      ],
    });
    if (r.error) throw new Error(r.error.message);
    const row = await harnessSql()<{ updated_seq: string }[]>`
      select updated_seq from public.model_object where project_id = ${project}::uuid and object_id = ${wallId}::uuid`;
    seqs.set(wallId, Number(row[0]!.updated_seq));
  };

  const versionDoc = async (id: string) => {
    const [row] = await harnessSql()<{ model_json: Doc; is_snapshot: boolean; label: string | null; cause: string }[]>`
      select model_json, is_snapshot, label, cause from public.model_version where id = ${id}::uuid`;
    return row!;
  };
  const wallEnd = (doc: Doc, wallId: string) => doc.objects.find((o) => o.id === wallId)?.data.geometry?.end?.x;

  beforeAll(async () => {
    tenant = await createTenant();
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, [...BASE, 'issue_permit_sets', 'issue_revisions']);
    fullUser = a.appUserId;
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, [...BASE, 'issue_permit_sets']);
    const c = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, c.membershipId, [...BASE, 'issue_revisions']);
    const v = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, v.membershipId, ['view_projects']);
    full = await signIn(a.email);
    rev0Only = await signIn(b.email);
    revNOnly = await signIn(c.email);
    viewer = await signIn(v.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-EZD-717-1 @smoke after Rev 0 the set is locked and edits go to a working copy', async () => {
    const project = await created('Issue lock');
    const wall = randomUUID();
    await saveWall(project, wall, 144);

    const r0 = await issue(full, project);
    expect(r0).toMatchObject({ ok: true, revNo: 0 });
    if (!r0.ok) return;
    const frozen = await versionDoc(r0.modelVersionId);
    expect(frozen).toMatchObject({ is_snapshot: true, label: 'Rev 0', cause: 'issue' });
    expect(wallEnd(frozen.model_json, wall)).toBe(144);

    // An edit after Rev 0 is saved to the working copy (model_object), not to the issued version.
    await saveWall(project, wall, 192);
    const [live] = await harnessSql()<{ data: { geometry: { end: { x: number } } } }[]>`
      select data from public.model_object where project_id = ${project}::uuid and object_id = ${wall}::uuid`;
    expect(live!.data.geometry.end.x).toBe(192);
    const after = await versionDoc(r0.modelVersionId);
    expect(wallEnd(after.model_json, wall)).toBe(144);
    expect(after).toMatchObject({ is_snapshot: true, label: 'Rev 0' });

    // The issue's PDF job reads the frozen version, so the edit never reaches the Rev 0 PDF.
    const printed = await readVersionObjects(adminDb() as never, tenant, project, r0.modelVersionId);
    expect(wallEnd({ objects: printed } as unknown as Doc, wall)).toBe(144);

    // The next issue gathers the edit into Rev 1; Rev 0 stays as it was.
    const r1 = await issue(full, project);
    expect(r1).toMatchObject({ ok: true, revNo: 1 });
    if (!r1.ok) return;
    expect(r1.modelVersionId).not.toBe(r0.modelVersionId);
    expect(wallEnd((await versionDoc(r1.modelVersionId)).model_json, wall)).toBe(192);
    expect(wallEnd((await versionDoc(r0.modelVersionId)).model_json, wall)).toBe(144);

    const revisions = await loadPermitRevisions(db(viewer), project);
    expect(revisions.map((r) => [r.revNo, r.modelVersionId])).toEqual([
      [0, r0.modelVersionId],
      [1, r1.modelVersionId],
    ]);
    const [row] = await harnessSql()<{ issued_by: string; sent_to: string; delta_object_ids: string[] }[]>`
      select issued_by, sent_to, delta_object_ids from public.permit_revision where id = ${r0.permitRevisionId}::uuid`;
    expect(row).toMatchObject({ issued_by: fullUser, sent_to: 'department', delta_object_ids: [] });

    // The permit set reads as issued and drafts Rev 2 (S13 Validation "Numbering").
    const sets = await loadProjectSheetSets(db(viewer), project);
    const permit = sets!.find((s) => s.kind === 'permit')!;
    expect(permit.lastIssuedVersionId).toBe(r1.modelVersionId);
    expect(permit.revisions?.map((r) => r.revNo)).toEqual([0, 1]);
    expect(sets!.find((s) => s.kind === 'client')!.revisions).toEqual([]);
  });

  it('an issued version can never be changed, renamed or deleted, by any caller', async () => {
    const project = await created('Issue frozen');
    await saveWall(project, randomUUID(), 96);
    const r = await issue(full, project);
    if (!r.ok) throw new Error(r.code);
    const sql = harnessSql();
    await expect(
      sql`update public.model_version set model_json = '{"objects":[]}'::jsonb where id = ${r.modelVersionId}::uuid`,
    ).rejects.toThrow();
    await expect(
      sql`update public.model_version set label = 'Renamed' where id = ${r.modelVersionId}::uuid`,
    ).rejects.toThrow(/model_version_issued_frozen/);
    await expect(
      sql`update public.model_version set is_snapshot = false where id = ${r.modelVersionId}::uuid`,
    ).rejects.toThrow(/model_version_issued_frozen/);
    await expect(sql`delete from public.model_version where id = ${r.modelVersionId}::uuid`).rejects.toThrow();
    // service_role through the API too.
    const upd = await adminDb()
      .from('model_version')
      .update({ label: 'Renamed' })
      .eq('id', r.modelVersionId);
    expect(upd.error).not.toBeNull();
    // The permit_revision row itself never changes either; only its export job is recorded, once.
    await expect(
      sql`update public.permit_revision set rev_no = 7 where id = ${r.permitRevisionId}::uuid`,
    ).rejects.toThrow(/permit_revision_frozen/);
    await expect(sql`delete from public.permit_revision where id = ${r.permitRevisionId}::uuid`).rejects.toThrow(
      /permit_revision_frozen/,
    );
    // A member write is refused by RLS (no write policy): nothing changes.
    const memberUpd = await full.serverDb
      .from('permit_revision')
      .update({ description: 'x' })
      .eq('id', r.permitRevisionId)
      .select('id');
    expect(memberUpd.data ?? []).toEqual([]);
  });

  it('the daily cleanup never deletes an issued version (W15: only rows neither named nor sent)', async () => {
    const project = await created('Issue cleanup');
    await saveWall(project, randomUUID(), 120);
    const r = await issue(full, project);
    if (!r.ok) throw new Error(r.code);
    const far = '2027-12-31T08:00:00Z';
    // Two runs: the first stamps what is due, the second deletes what was stamped (Q-0708).
    for (let i = 0; i < 2; i++) {
      const run = await adminDb().rpc('run_version_cleanup', { p_tenant: tenant, p_now: far, p_dry_run: false });
      expect(run.error).toBeNull();
    }
    const left = await harnessSql()<{ id: string }[]>`
      select id from public.model_version where id = ${r.modelVersionId}::uuid`;
    expect(left).toHaveLength(1);
    expect(await loadPermitRevisions(db(full), project)).toHaveLength(1);
  });

  it('Rev 0 needs Issue permit sets and Rev 1+ needs Issue revisions (S13 Permissions)', async () => {
    const project = await created('Issue permissions');
    await saveWall(project, randomUUID(), 100);
    expect(await issue(revNOnly, project)).toEqual({ ok: false, code: 'permission_denied' });
    expect(await issue(viewer, project)).toEqual({ ok: false, code: 'permission_denied' });
    // A refused issue leaves no checkpoint behind.
    const before = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.model_version where project_id = ${project}::uuid and cause = 'issue'`;
    expect(before[0]!.n).toBe('0');
    expect(await issue(rev0Only, project)).toMatchObject({ ok: true, revNo: 0 });
    expect(await issue(rev0Only, project)).toEqual({ ok: false, code: 'permission_denied' });
    expect(await issue(revNOnly, project)).toMatchObject({ ok: true, revNo: 1 });
    expect(await issue(revNOnly, project)).toMatchObject({ ok: true, revNo: 2 });
  });

  it('two issues at the same moment get different numbers, 0 and 1', async () => {
    const project = await created('Issue race');
    await saveWall(project, randomUUID(), 100);
    const [x, y] = await Promise.all([issue(full, project), issue(full, project)]);
    expect([x, y].map((r) => (r.ok ? r.revNo : -1)).sort()).toEqual([0, 1]);
  });

  it('stores the load calc with the issued version, writes plan_set.issued and leaves the status (Q-0199)', async () => {
    const project = await created('Issue calc');
    await saveWall(project, randomUUID(), 100);
    const electrical = {
      case: 'proposed' as const,
      method: 'standard' as const,
      inputs: { panelId: randomUUID(), edition: 'fbc9_nec2023' },
      results: { ok: true, totalVa: 24000, amps: 100 },
    };
    const r = await issue(full, project, { electrical, description: 'Permit set' });
    if (!r.ok) throw new Error(r.code);
    const calc = await harnessSql()<{ model_version_id: string; case: string; method: string; results: unknown }[]>`
      select model_version_id, "case", method, results from public.electrical_calc where project_id = ${project}::uuid`;
    expect(calc).toEqual([
      { model_version_id: r.modelVersionId, case: 'proposed', method: 'standard', results: electrical.results },
    ]);
    const events = await harnessSql()<{ action: string; details: { rev_no: number; model_version_id: string } }[]>`
      select action, details from public.event_log where object_id = ${project}::uuid and action = 'plan_set.issued'`;
    expect(events).toHaveLength(1);
    expect(events[0]!.details).toMatchObject({ rev_no: 0, model_version_id: r.modelVersionId });
    const [p] = await harnessSql()<{ status: string }[]>`select status from public.project where id = ${project}::uuid`;
    expect(p!.status).toBe('draft');
    expect((await loadPermitRevisions(db(full), project))[0]!.description).toBe('Permit set');
    // A malformed load calc is refused before anything is written.
    expect(await issue(full, project, { electrical: { ...electrical, case: 'other' as never } })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
  });
});
