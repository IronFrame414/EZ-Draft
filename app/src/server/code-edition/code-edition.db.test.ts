// EZD-613 (AC-EZD-613-1; CLAUDE.md rule 4). Expected values: S15g (Save "Existing projects keep their own
// edition"; the page needs its own switch, settings_code_edition, Q-0210; the v1 edition FBC 9th ed. with NEC 2023,
// Q-0220), S15g Decision 2 (the project's own edition is set in Project settings) and the migration header
// (20261119120000_create_code_edition.sql). Calls go through the gated serverDb of `signIn`, as the routes do.
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
import { projectEdition } from '../../lib/code-edition/editions';

type Row = { tenant_id: string; code_edition: string | null; tenant_defaults: unknown; changed: string[] };

describe('EZD-613 update_tenant_code_edition and the project edition', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session; // settings_code_edition, edit_model, create_projects
  let plain: Session; // edit_model, create_projects, no settings_code_edition
  let ownerB: Session; // another company, settings_code_edition

  const setDefault = (s: Session, edition: string | null, optional: boolean | null) =>
    s.serverDb.rpc('update_tenant_code_edition', {
      p_code_edition: edition as never,
      p_optional_load_calc: optional as never,
    });
  const tenantRow = async (id: string) =>
    (await harnessSql()`select code_edition, defaults, updated_at from public.tenant where id = ${id}::uuid`)[0];
  const projectRow = async (id: string) =>
    (await harnessSql()`select code_edition, updated_at from public.project where id = ${id}::uuid`)[0];
  const create = async (s: Session, name: string) => {
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
  const setProjectEdition = (s: Session, project: string, edition: unknown) =>
    s.serverDb.rpc('update_project_settings', {
      p_project: project,
      p_changes: { code_edition: edition } as never,
    });

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, [
      'view_projects',
      'edit_model',
      'create_projects',
      'settings_code_edition',
    ]);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, ['settings_code_edition']);
    owner = await signIn(m1.email);
    plain = await signIn(m2.email);
    ownerB = await signIn(m3.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-EZD-613-1: a project keeps its edition after the default changes', async () => {
    const kept = await create(owner, 'Keeps its edition');
    const unset = await create(owner, 'No edition yet');
    // New projects store no edition (assumptions EZD-613): they read the company default.
    expect((await projectRow(kept)).code_edition).toBeNull();

    // The project gets its own edition in Project settings (Edit model, no lock needed).
    const set = await setProjectEdition(owner, kept, 'fbc9_nec2023');
    expect(set.error).toBeNull();
    expect((set.data as { status: string; changed: string[] }).changed).toEqual(['code_edition']);
    const keptBefore = await projectRow(kept);
    const unsetBefore = await projectRow(unset);
    expect(keptBefore.code_edition).toBe('fbc9_nec2023');

    // The company default changes.
    const r = await setDefault(owner, 'fbc9_nec2023', true);
    expect(r.error).toBeNull();
    const row = (r.data as Row[])[0];
    expect(row.tenant_id).toBe(tenantA);
    expect(row.code_edition).toBe('fbc9_nec2023');
    expect(row.changed).toEqual(['code_edition', 'optional_load_calc']);

    // Neither project row was touched.
    expect(await projectRow(kept)).toEqual(keptBefore);
    expect(await projectRow(unset)).toEqual(unsetBefore);

    // A later default (an edition EZD-643 adds, Q-0765) still leaves the project on its own edition.
    await harnessSql()`update public.tenant set code_edition = 'fbc8_nec2020' where id = ${tenantA}::uuid`;
    const tenant = await tenantRow(tenantA);
    expect(projectEdition((await projectRow(kept)).code_edition, tenant.code_edition)).toBe('fbc9_nec2023');
    expect((await projectRow(kept)).code_edition).toBe('fbc9_nec2023');
    await harnessSql()`update public.tenant set code_edition = 'fbc9_nec2023' where id = ${tenantA}::uuid`;
  });

  it('stores the load-calc default in tenant.defaults; null leaves a value alone; nothing changed is no update', async () => {
    const before = await tenantRow(tenantA);
    const same = await setDefault(owner, 'fbc9_nec2023', null);
    expect(same.error).toBeNull();
    expect((same.data as Row[])[0].changed).toEqual([]);
    expect((await tenantRow(tenantA)).updated_at).toEqual(before.updated_at);

    const off = await setDefault(owner, null, false);
    expect((off.data as Row[])[0].changed).toEqual(['optional_load_calc']);
    const after = await tenantRow(tenantA);
    expect(after.code_edition).toBe('fbc9_nec2023');
    expect((after.defaults as Record<string, unknown>).optional_load_calc).toBe(false);
  });

  it('refuses a member without settings_code_edition (42501) and an unknown edition (22023)', async () => {
    const before = await tenantRow(tenantA);
    expect((await setDefault(plain, 'fbc9_nec2023', true)).error?.code).toBe('42501');
    expect((await setDefault(owner, 'FBC 2023', null)).error?.code).toBe('22023');
    expect((await setDefault(owner, 'fbc8_nec2020', null)).error?.code).toBe('22023');
    expect(await tenantRow(tenantA)).toEqual(before);
  });

  it('Project settings refuses an edition outside the list (22023)', async () => {
    const p = await create(owner, 'Bad edition');
    for (const bad of ['FBC 2023', 9, null]) {
      expect((await setProjectEdition(owner, p, bad)).error?.code, String(bad)).toBe('22023');
    }
    expect((await projectRow(p)).code_edition).toBeNull();
  });

  it("one company cannot change or read another company's code edition", async () => {
    const aBefore = await tenantRow(tenantA);
    const r = await setDefault(ownerB, 'fbc9_nec2023', true);
    expect(r.error).toBeNull();
    expect((r.data as Row[])[0].tenant_id).toBe(tenantB);
    expect(await tenantRow(tenantA)).toEqual(aBefore);
    expect((await tenantRow(tenantB)).code_edition).toBe('fbc9_nec2023');
    const read = await ownerB.serverDb.from('tenant').select('id, code_edition').eq('id', tenantA);
    expect(read.data ?? []).toEqual([]);

    // Nor another company's project edition.
    const p = await create(owner, 'Company A project');
    const cross = await setProjectEdition(ownerB, p, 'fbc9_nec2023');
    expect(cross.error).not.toBeNull();
    expect((await projectRow(p)).code_edition).toBeNull();
  });
});
