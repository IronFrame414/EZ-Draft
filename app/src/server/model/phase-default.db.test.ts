// EZD-214 (AC-EZD-214-1, -6, -7; 03 Q-0664 "View default"; 09m row 7). Local database, real sign-in (harness as
// plan-scale.db.test.ts). Expected values: Q-0664 (existing or proposed; new projects start Existing; Edit model
// writes it) and the set_plan_scale error codes (22023 invalid_input, 42501 permission_denied, P0002
// project_not_found; the check constraint refuses any other stored value: 23514).
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

describe('EZD-214 set_phase_default', () => {
  let tenantA = '';
  let tenantB = '';
  let project = '';
  let fresh = '';
  let otherProject = '';
  let editor: Member;
  let editorSession: Session;
  let viewerSession: Session;
  let otherSession: Session;

  const call = (s: Session, p_project: string, p_phase: string) =>
    s.serverDb.rpc('set_phase_default', { p_project, p_phase });
  const phaseOf = async (id: string) =>
    (
      await harnessSql()<{ phase_default: string }[]>`
      select phase_default from public.project where id = ${id}::uuid`
    )[0].phase_default;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [project, fresh] = await createProjects(tenantA, 2);
    [otherProject] = await createProjects(tenantB, 1);
    editor = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, editor.membershipId, ['view_projects', 'edit_model']);
    const viewer = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, viewer.membershipId, ['view_projects']);
    const other = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, other.membershipId, ['view_projects', 'edit_model']);
    editorSession = await signIn(editor.email);
    viewerSession = await signIn(viewer.email);
    otherSession = await signIn(other.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-214 a new project starts Existing and the column takes only existing or proposed', async () => {
    expect(await phaseOf(fresh)).toBe('existing');
    const sql = harnessSql();
    await expect(
      sql`update public.project set phase_default = 'demo' where id = ${fresh}::uuid`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`update public.project set phase_default = null where id = ${fresh}::uuid`,
    ).rejects.toMatchObject({ code: '23502' });
    expect(await phaseOf(fresh)).toBe('existing');
  });

  it('EZD-214 set_phase_default saves for an editor and refuses view-only, bad values and other companies', async () => {
    const ok = await call(editorSession, project, 'proposed');
    expect(ok.error).toBeNull();
    expect(await phaseOf(project)).toBe('proposed');

    const bad = await call(editorSession, project, 'demo');
    expect(bad.error?.code).toBe('22023');
    const denied = await call(viewerSession, project, 'existing');
    expect(denied.error?.code).toBe('42501');
    const other = await call(editorSession, otherProject, 'proposed');
    expect(other.error?.code).toBe('P0002');
    const reverse = await call(otherSession, project, 'existing');
    expect(reverse.error?.code).toBe('P0002');
    expect(await phaseOf(project)).toBe('proposed');
    expect(await phaseOf(otherProject)).toBe('existing');
  });

  it('EZD-214 a direct update of phase_default is refused for a member and unseen by another company', async () => {
    const before = await phaseOf(project);
    const next = before === 'existing' ? 'proposed' : 'existing';
    const direct = await viewerSession.serverDb
      .from('project')
      .update({ phase_default: next })
      .eq('id', project);
    expect(direct.error?.code).toBe('42501');
    await otherSession.serverDb.from('project').update({ phase_default: next }).eq('id', project);
    expect(await phaseOf(project)).toBe(before);
  });

  it('EZD-214 loadModel returns the phase view, existing when never toggled', async () => {
    const db = editorSession.serverDb as unknown as SupabaseClient<Database>;
    const before = await loadModel(db, fresh, ctxOf(editor));
    expect(before?.project.phaseDefault).toBe('existing');
    const saved = await call(editorSession, fresh, 'proposed');
    expect(saved.error).toBeNull();
    const after = await loadModel(db, fresh, ctxOf(editor));
    expect(after?.project.phaseDefault).toBe('proposed');
  });
});
