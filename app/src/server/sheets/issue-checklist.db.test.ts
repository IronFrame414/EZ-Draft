// EZD-716 (AC-EZD-716-1 "An orphan 'Not on a wall' flag blocks Issue"; S13 Validation "Issue gates (Round 12): ...
// no red/orphan flags (e.g. "not on a wall")"; CLAUDE.md rule 4): the issue checklist read from the saved model under
// the member's session. No new table: the checklist reads model_object, project and review_item under their RLS, so
// another company's project reads as null here. Expected values are the spec's: a saved door with no host wall is a
// red gate that blocks Issue; the same door on its wall is not.
import { CURRENT_SCHEMA_VERSION, createOpeningData, createWallData, type WallObject } from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import type { Database } from '../db/database.types';
import type { PermissionContext } from '../permissions/context';
import { loadIssueChecklist } from './issue-checklist';

type Person = { appUserId: string; membershipId: string; email: string };
const ctxOf = (m: Person): PermissionContext => ({
  appUserId: m.appUserId,
  membershipId: m.membershipId,
  scope: 'all',
  permissions: new Set(['view_projects', 'edit_model']),
  listedProjectIds: new Set<string>(),
});
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

describe('EZD-716 issue checklist', () => {
  let editor: Person;
  let editorS: Session;
  let otherB: Person;
  let otherBS: Session;

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

  // A 12' wall and a door on it; `hosted` false saves the door with no host wall (Not on a wall).
  const saveWallAndDoor = async (s: Session, project: string, hosted: boolean) => {
    const lock = await s.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-716' });
    expect(lock.error).toBeNull();
    const epoch = Number((lock.data as { lock_epoch: number }).lock_epoch);
    // The project's first floor (create_project stores one); a wall's level must name it.
    const floor = await s.serverDb
      .from('model_object')
      .select('object_id')
      .eq('project_id', project)
      .eq('type', 'floor')
      .limit(1)
      .single();
    expect(floor.error).toBeNull();
    const level = (floor.data as { object_id: string }).object_id;
    const w = createWallData({ start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, level });
    if (!w.ok) throw new Error(w.reason);
    const wall: WallObject = { id: randomUUID(), type: 'wall', data: w.data };
    const d = createOpeningData({ kind: 'door', host: wall, center: { x: 72, y: 0 } });
    const door = hosted ? d : { ...d, geometry: { ...d.geometry, hostWallId: null, axis: { x: 1, y: 0 } } };
    const change = (id: string, type: string, data: unknown) => ({
      id,
      base_seq: 0,
      deleted: false,
      type,
      schema_version: CURRENT_SCHEMA_VERSION,
      data,
    });
    const r = await s.serverDb.rpc('save_objects', {
      p_project: project,
      p_lock_epoch: epoch,
      p_changes: [change(wall.id, 'wall', wall.data), change(randomUUID(), 'opening', door)],
    });
    expect(r.error).toBeNull();
  };

  beforeAll(async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    editor = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, editor.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    otherB = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, otherB.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    editorS = await signIn(editor.email);
    otherBS = await signIn(otherB.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-EZD-716-1: a saved door Not on a wall is a red gate that blocks Issue', async () => {
    const project = await created(editorS, 'Issue checklist orphan');
    await saveWallAndDoor(editorS, project, false);
    const out = await loadIssueChecklist(db(editorS), project, ctxOf(editor), editor);
    expect(out).not.toBeNull();
    expect(out!.checklist.blocked).toBe(true);
    expect(out!.checklist.gates).toContain('orphan_flags');
    expect(out!.checklist.rows.find((r) => r.id === 'orphan_flags')).toMatchObject({
      status: 'gate',
      detail: { open: 1 },
    });
  });

  it('the same door on its wall passes the orphan flag gate', async () => {
    const project = await created(editorS, 'Issue checklist hosted');
    await saveWallAndDoor(editorS, project, true);
    const out = await loadIssueChecklist(db(editorS), project, ctxOf(editor), editor);
    expect(out!.checklist.rows.find((r) => r.id === 'orphan_flags')).toMatchObject({
      status: 'pass',
      detail: { open: 0 },
    });
    expect(out!.checklist.gates).not.toContain('orphan_flags');
  });

  it("another company's project reads as null", async () => {
    const project = await created(editorS, 'Issue checklist private');
    await saveWallAndDoor(editorS, project, false);
    expect(await loadIssueChecklist(db(otherBS), project, ctxOf(otherB), otherB)).toBeNull();
  });
});
