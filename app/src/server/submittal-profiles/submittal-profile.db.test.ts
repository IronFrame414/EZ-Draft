// EZD-712 (AC-EZD-712-1; CLAUDE.md rule 4). Expected values: S15c (one profile marked Default; Set as default
// "makes the profile the company default for new projects"; New profile "copied from the default", name
// required and unique; Duplicate copies; a profile cannot be removed while it is the default; permit size fixed
// at 24x36, Decision 3; Decision 2 "Each project picks a profile ... defaults to the company default"; the page
// needs its own switch, settings_sheet_presets), 03c submittal_profile, 08 PBC row (10 MB, 80 characters) and
// the migration header (20261119140000_create_submittal_profile.sql). Calls go through the gated serverDb.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';

type Profile = { id: string; department: string; is_default: boolean };

describe('EZD-712 submittal profiles', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session; // settings_sheet_presets, create_projects
  let plain: Session; // create_projects only
  let ownerB: Session; // another company, settings_sheet_presets

  const profilesOf = async (tenant: string) =>
    (await harnessSql()`select id, department, is_default, archived_at, max_file_mb, naming_max_length,
        naming_template, sheet_size, submittal_type, signer, stamp_box_width_in, stamp_box_height_in,
        stamp_box_position, file_split, revision_naming
      from public.submittal_profile where tenant_id = ${tenant}::uuid order by created_at, department`) as unknown as (Profile &
      Record<string, unknown>)[];
  const defaultOf = async (tenant: string) => (await profilesOf(tenant)).find((p) => p.is_default)!;
  const projectProfile = async (id: string) =>
    (await harnessSql()`select submittal_profile_id from public.project where id = ${id}::uuid`)[0]
      .submittal_profile_id as string | null;
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
  const newProfile = async (s: Session, department: string, source?: string) =>
    s.serverDb.rpc('create_submittal_profile', {
      p_department: department,
      ...(source ? { p_source: source } : {}),
    });

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    // Companies get their default from the migration and supabase/seed.sql; a test company calls the same seed.
    await harnessSql()`select private.seed_submittal_profile(${tenantA}::uuid)`;
    await harnessSql()`select private.seed_submittal_profile(${tenantB}::uuid)`;
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, [
      'view_projects',
      'create_projects',
      'settings_sheet_presets',
    ]);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects', 'create_projects']);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, ['settings_sheet_presets']);
    owner = await signIn(m1.email);
    plain = await signIn(m2.email);
    ownerB = await signIn(m3.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  describeTenantIsolation('submittal_profile', {
    makeRow: (t) => ({ tenant_id: t, department: `Iso ${randomUUID()}`, is_default: false }),
  });

  it('a seeded company has exactly one profile, the default, with the S15c defaults', async () => {
    const rows = await profilesOf(tenantA);
    expect(rows).toHaveLength(1);
    const [p] = rows;
    expect(p.is_default).toBe(true);
    expect(p.department).toBe('Palm Beach County');
    expect(p.sheet_size).toBe('24x36');
    expect(p.submittal_type).toBe('electronic');
    expect(p.naming_template).toBe('{address} {description}');
    expect(Number(p.max_file_mb)).toBe(10);
    expect(p.naming_max_length).toBe(80);
    expect(Number(p.stamp_box_width_in)).toBe(3);
    expect(Number(p.stamp_box_height_in)).toBe(3);
    expect(p.stamp_box_position).toBe('bottom_right');
    expect(p.file_split).toBe('combined');
    expect(p.revision_naming).toBe('version_in_name');
    expect(p.signer).toBe('none');
  });

  it('AC-EZD-712-1: a new project uses the default profile; a later default applies to new projects only', async () => {
    const first = await defaultOf(tenantA);
    const p1 = await create(plain, 'Uses the default');
    expect(await projectProfile(p1)).toBe(first.id);

    const made = await newProfile(owner, 'City of Boca Raton');
    expect(made.error).toBeNull();
    const boca = (made.data as Profile[])[0];
    const set = await owner.serverDb.rpc('set_default_submittal_profile', { p_id: boca.id });
    expect(set.error).toBeNull();
    expect(set.data).toBe(first.id);
    expect((await defaultOf(tenantA)).id).toBe(boca.id);
    expect((await profilesOf(tenantA)).filter((p) => p.is_default)).toHaveLength(1);

    const p2 = await create(owner, 'After the change');
    expect(await projectProfile(p2)).toBe(boca.id);
    expect(await projectProfile(p1)).toBe(first.id);

    // Back to the first default for the tests below.
    expect(
      (await owner.serverDb.rpc('set_default_submittal_profile', { p_id: first.id })).error,
    ).toBeNull();
  });

  it('New profile copies the default; Duplicate copies the given profile; the name is required and unique', async () => {
    const def = await defaultOf(tenantA);
    const upd = await owner.serverDb.rpc('update_submittal_profile', {
      p_id: def.id,
      p_changes: { signer: 'architect', stamp_box_width_in: 6, stamp_box_height_in: 2 } as never,
    });
    expect(upd.error).toBeNull();
    expect((upd.data as { changed: string[] }).changed).toEqual([
      'signer',
      'stamp_box_height_in',
      'stamp_box_width_in',
    ]);

    const broward = ((await newProfile(owner, '  Broward County ')).data as Profile[])[0];
    const rows = await profilesOf(tenantA);
    const b = rows.find((r) => r.id === broward.id)!;
    expect(b.department).toBe('Broward County');
    expect(b.is_default).toBe(false);
    expect(b.signer).toBe('architect');
    expect(Number(b.stamp_box_width_in)).toBe(6);

    await owner.serverDb.rpc('update_submittal_profile', {
      p_id: broward.id,
      p_changes: { submittal_type: 'paper' } as never,
    });
    const copy = ((await newProfile(owner, 'Broward copy', broward.id)).data as Profile[])[0];
    expect((await profilesOf(tenantA)).find((r) => r.id === copy.id)!.submittal_type).toBe('paper');

    expect((await newProfile(owner, 'broward county')).error?.code).toBe('23505');
    expect((await newProfile(owner, '   ')).error?.code).toBe('22023');
    const rename = await owner.serverDb.rpc('update_submittal_profile', {
      p_id: copy.id,
      p_changes: { department: 'BROWARD COUNTY' } as never,
    });
    expect(rename.error?.code).toBe('23505');
  });

  it('the table refuses bad values: 11x17 on a permit profile, a pattern without {address}, unknown keys', async () => {
    const def = await defaultOf(tenantA);
    const bad = async (changes: Record<string, unknown>) =>
      (
        await owner.serverDb.rpc('update_submittal_profile', {
          p_id: def.id,
          p_changes: changes as never,
        })
      ).error?.code;
    expect(await bad({ sheet_size: '11x17' })).toBe('22023');
    expect(await bad({ naming_template: '{description} {rev}' })).toBe('22023');
    expect(await bad({ signer: 'plumber' })).toBe('22023');
    expect(await bad({ stamp_box_width_in: 'wide' })).toBe('22023');
    expect(await bad({ is_default: false })).toBe('22023');
    expect(await bad({ tenant_id: tenantB })).toBe('22023');
    expect(await bad({ department: '' })).toBe('22023');
  });

  it('the default cannot be archived or deleted; deleting a profile moves its projects to the default', async () => {
    const def = await defaultOf(tenantA);
    expect(
      (await owner.serverDb.rpc('archive_submittal_profile', { p_id: def.id, p_archived: true }))
        .error?.code,
    ).toBe('P0001');
    expect(
      (await owner.serverDb.rpc('delete_submittal_profile', { p_id: def.id })).error?.code,
    ).toBe('P0001');

    const wpb = ((await newProfile(owner, 'City of West Palm Beach')).data as Profile[])[0];
    const project = await create(owner, 'Uses West Palm Beach');
    await harnessSql()`update public.project set submittal_profile_id = ${wpb.id}::uuid where id = ${project}::uuid`;

    const archived = await owner.serverDb.rpc('archive_submittal_profile', {
      p_id: wpb.id,
      p_archived: true,
    });
    expect(archived.error).toBeNull();
    expect(archived.data).toBe(true);
    expect(
      (await owner.serverDb.rpc('set_default_submittal_profile', { p_id: wpb.id })).error?.code,
    ).toBe('22023');

    const del = await owner.serverDb.rpc('delete_submittal_profile', { p_id: wpb.id });
    expect(del.error).toBeNull();
    expect(del.data).toBe(1);
    expect(await projectProfile(project)).toBe(def.id);
    expect((await profilesOf(tenantA)).some((p) => p.id === wpb.id)).toBe(false);
  });

  it('writes need settings_sheet_presets and stay inside the company', async () => {
    const def = await defaultOf(tenantA);
    expect((await newProfile(plain, 'No switch')).error?.code).toBe('42501');
    expect(
      (
        await plain.serverDb.rpc('update_submittal_profile', {
          p_id: def.id,
          p_changes: {} as never,
        })
      ).error?.code,
    ).toBe('42501');
    expect(
      (await plain.serverDb.rpc('set_default_submittal_profile', { p_id: def.id })).error?.code,
    ).toBe('42501');
    expect(
      (await plain.serverDb.rpc('delete_submittal_profile', { p_id: def.id })).error?.code,
    ).toBe('42501');

    // Another company's owner sees none of A's profiles and cannot write them.
    expect(
      (
        await ownerB.serverDb.rpc('update_submittal_profile', {
          p_id: def.id,
          p_changes: { signer: 'none' } as never,
        })
      ).error?.code,
    ).toBe('P0002');
    expect(
      (await ownerB.serverDb.rpc('set_default_submittal_profile', { p_id: def.id })).error?.code,
    ).toBe('P0002');
    expect(
      (await ownerB.serverDb.rpc('delete_submittal_profile', { p_id: def.id })).error?.code,
    ).toBe('P0002');
    expect((await newProfile(ownerB, 'Copy of A', def.id)).error?.code).toBe('P0002');

    // Members read their own company's profiles; the table is select-only for them.
    const own = await plain.serverDb.from('submittal_profile').select('id');
    expect(own.error).toBeNull();
    expect((own.data ?? []).every((r) => r.id)).toBe(true);
    const direct = await owner.serverDb
      .from('submittal_profile')
      .insert({ tenant_id: tenantA, department: 'Direct' } as never);
    expect(direct.error?.code).toBe('42501');
  });

  it('a company with no profile: a project stores none, and the first New profile becomes the default', async () => {
    const tenantC = await createTenant();
    const m = await createMember({ tenantId: tenantC, scope: 'all' });
    await setPermissions(tenantC, m.membershipId, [
      'view_projects',
      'create_projects',
      'settings_sheet_presets',
    ]);
    const ownerC = await signIn(m.email);
    const before = await create(ownerC, 'Before any profile');
    expect(await projectProfile(before)).toBeNull();
    const first = ((await newProfile(ownerC, 'Palm Beach County')).data as Profile[])[0];
    expect(first.is_default).toBe(true);
    const after = await create(ownerC, 'After the first profile');
    expect(await projectProfile(after)).toBe(first.id);
  });

  it("a project cannot point at another company's profile", async () => {
    const bDefault = await defaultOf(tenantB);
    const project = await create(owner, 'Cross check');
    await expect(
      harnessSql()`update public.project set submittal_profile_id = ${bDefault.id}::uuid where id = ${project}::uuid`,
    ).rejects.toMatchObject({ code: '23503' });
  });
});
