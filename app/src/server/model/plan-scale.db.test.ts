// EZD-219 D1, D2 (vault/plans/EZD-219.md section 4; section 1 step 1 (a)-(c), step 5; AC-EZD-219-3). Local
// database, real sign-in (harness as create-project.db.test.ts). Expected values: step 1 (keeps other settings
// keys; 22023 invalid_input, 42501 permission_denied, P0002 project_not_found; the check constraint refuses a
// stored plan_scale outside the seven numbers: 23514) and step 5 / Decided "Reading `plan_scale`" (unset → 0.5).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import type { PermissionContext } from '../permissions/context';
import { loadModel } from './model';

const ctxOf = (m: { appUserId: string; membershipId: string }): PermissionContext => ({
  appUserId: m.appUserId,
  membershipId: m.membershipId,
  scope: 'all',
  permissions: new Set(['view_projects', 'edit_model']),
  listedProjectIds: new Set<string>(),
});

describe('EZD-219 set_plan_scale', () => {
  let tenantA = '';
  let tenantB = '';
  let project = '';
  let unset = '';
  let otherProject = '';
  let editor: Member;
  let editorSession: Session;
  let viewerSession: Session;

  const call = (s: Session, p_project: string, p_scale: number) =>
    s.serverDb.rpc('set_plan_scale', { p_project, p_scale });
  const settingsOf = async (id: string) =>
    (
      await harnessSql()<{ settings: unknown }[]>`
      select settings from public.project where id = ${id}::uuid`
    )[0].settings;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [project, unset] = await createProjects(tenantA, 2);
    [otherProject] = await createProjects(tenantB, 1);
    editor = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, editor.membershipId, ['view_projects', 'edit_model']);
    const viewer = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, viewer.membershipId, ['view_projects']);
    editorSession = await signIn(editor.email);
    viewerSession = await signIn(viewer.email);
    await harnessSql()`update public.project set settings = '{"keep":true}'::jsonb
      where id = ${project}::uuid`;
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-219 D1 set_plan_scale saves a listed scale, keeps other keys, and refuses the rest', async () => {
    const ok = await call(editorSession, project, 0.25);
    expect(ok.error).toBeNull();
    expect(await settingsOf(project)).toEqual({ keep: true, plan_scale: 0.25 });

    const bad = await call(editorSession, project, 0.3);
    expect(bad.error?.code).toBe('22023');
    const denied = await call(viewerSession, project, 0.25);
    expect(denied.error?.code).toBe('42501');
    const other = await call(editorSession, otherProject, 0.25);
    expect(other.error?.code).toBe('P0002');
    expect(await settingsOf(project)).toEqual({ keep: true, plan_scale: 0.25 });

    const sql = harnessSql();
    await expect(
      sql`update public.project set settings = '{"plan_scale":0.3}'::jsonb where id = ${project}::uuid`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`update public.project set settings = '{"plan_scale":"0.5"}'::jsonb where id = ${project}::uuid`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('EZD-219 D2 loadModel returns the plan scale, 0.5 when unset', async () => {
    const db = editorSession.serverDb as unknown as SupabaseClient<Database>;
    const before = await loadModel(db, unset, ctxOf(editor));
    expect(before?.project.planScale).toBe(0.5);
    const saved = await call(editorSession, unset, 0.25);
    expect(saved.error).toBeNull();
    const after = await loadModel(db, unset, ctxOf(editor));
    expect(after?.project.planScale).toBe(0.25);
  });
});
