// EZD-712 (S15c Decision 2: each project picks a profile in project settings and defaults to the company default;
// AC-EZD-712-1; CLAUDE.md rule 4). Expected values: the migration header (20261119140000_create_submittal_profile
// .sql): projects that exist when profiles ship take the company default; set_project_submittal_profile needs Edit
// model (42501), a visible project (P0002) and an active profile of the caller's own company (22023).
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

describe('EZD-712 project submittal profile', () => {
  let tenantA = '';
  let tenantB = '';
  let editor: Session; // edit_model
  let viewer: Session; // view only
  let editorB: Session; // another company, edit_model

  const profileOf = async (project: string) =>
    (
      await harnessSql()`select submittal_profile_id from public.project where id = ${project}::uuid`
    )[0].submittal_profile_id as string | null;
  const defaultOf = async (tenant: string) =>
    (
      await harnessSql()`select id from public.submittal_profile where tenant_id = ${tenant}::uuid and is_default`
    )[0].id as string;
  const addProfile = async (tenant: string, department: string, archived = false) =>
    (
      await harnessSql()`insert into public.submittal_profile (tenant_id, department, archived_at)
        values (${tenant}::uuid, ${department}, ${archived ? new Date() : null}) returning id`
    )[0].id as string;
  const pick = (s: Session, project: string, profile: string) =>
    s.serverDb.rpc('set_project_submittal_profile', { p_project: project, p_profile: profile });

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects', 'edit_model']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects']);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, ['view_projects', 'edit_model']);
    editor = await signIn(m1.email);
    viewer = await signIn(m2.email);
    editorB = await signIn(m3.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('projects made before the company had a profile take the company default; others keep theirs', async () => {
    // Made before any profile exists, as tenant 1's projects were before this ticket.
    const [old1, old2] = await createProjects(tenantA, 2);
    expect(await profileOf(old1)).toBeNull();
    await harnessSql()`select private.seed_submittal_profile(${tenantA}::uuid)`;
    await harnessSql()`select private.seed_submittal_profile(${tenantB}::uuid)`;
    const other = await addProfile(tenantA, 'Broward County');
    await harnessSql()`update public.project set submittal_profile_id = ${other}::uuid where id = ${old2}::uuid`;

    // Only this company's projects: the seeded companies' rows stay untouched.
    const moved = (
      await harnessSql()`select private.backfill_project_submittal_profiles(${tenantA}::uuid) as n`
    )[0].n as number;
    expect(moved).toBe(1);
    expect(await profileOf(old1)).toBe(await defaultOf(tenantA));
    expect(await profileOf(old2)).toBe(other);
  });

  it('Project settings picks an active profile of the company with Edit model', async () => {
    const [project] = await createProjects(tenantA, 1);
    const def = await defaultOf(tenantA);
    expect(await profileOf(project)).toBe(def);
    const boca = await addProfile(tenantA, 'City of Boca Raton');

    const r = await pick(editor, project, boca);
    expect(r.error).toBeNull();
    expect(r.data).toBe(true);
    expect(await profileOf(project)).toBe(boca);
    expect((await pick(editor, project, boca)).data).toBe(false);

    expect((await pick(viewer, project, def)).error?.code).toBe('42501');
    const archived = await addProfile(tenantA, 'Old paper', true);
    expect((await pick(editor, project, archived)).error?.code).toBe('22023');
    expect((await pick(editor, project, await defaultOf(tenantB))).error?.code).toBe('22023');
    expect((await pick(editorB, project, await defaultOf(tenantB))).error?.code).toBe('P0002');
    expect(await profileOf(project)).toBe(boca);
  });
});
