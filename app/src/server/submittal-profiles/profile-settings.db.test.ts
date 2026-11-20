// EZD-713 (S15c inspector fields; CLAUDE.md rule 4). The profile settings EZD-713 puts on screen save through
// update_submittal_profile (the PATCH route's parsePatchBody columns) and read back through
// listSubmittalProfiles; the table checks refuse out-of-range values; another company cannot change them.
// Expected values: S15c (File split, Max file size "PBC 10 MB", Revision naming, Flatten, Bookmarks on by
// default, TOC sheet, Resubmittal mode, transmittal, Minimum scale 3/16" = 1'-0", Export unsigned), 08 (West Palm
// Beach ALL CAPS 30 characters) and the table checks of 20261119140000_create_submittal_profile.sql.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parsePatchBody } from '../../lib/submittal-profiles/profiles';
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
import { listSubmittalProfiles } from './submittal-profiles';

describe('EZD-713 profile settings', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session;
  let ownerB: Session;
  let profileId = '';

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    await harnessSql()`select private.seed_submittal_profile(${tenantA}::uuid)`;
    await harnessSql()`select private.seed_submittal_profile(${tenantB}::uuid)`;
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['settings_sheet_presets']);
    const m2 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m2.membershipId, ['settings_sheet_presets']);
    owner = await signIn(m1.email);
    ownerB = await signIn(m2.email);
    const rows = await harnessSql()`select id from public.submittal_profile
      where tenant_id = ${tenantA}::uuid and is_default`;
    profileId = rows[0].id as string;
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  const save = (s: Session, id: string, fields: Record<string, unknown>) => {
    const body = parsePatchBody({ fields });
    if (body === null || body.kind !== 'fields') throw new Error('test body refused');
    return s.serverDb.rpc('update_submittal_profile', {
      p_id: id,
      p_changes: body.columns as never,
    });
  };

  it('a new profile starts with the S15c defaults for these settings', async () => {
    const p = (await listSubmittalProfiles(owner.serverDb as never)).find(
      (x) => x.id === profileId,
    )!;
    expect(p).toMatchObject({
      fileSplit: 'combined',
      revisionNaming: 'version_in_name',
      namingUpper: false,
      flatten: false,
      exportUnsigned: false,
      bookmarks: true,
      tocSheet: false,
      resubmittalMode: 'changed_sheets',
      transmittal: false,
      minScaleInPerFt: null,
    });
  });

  it('every setting saves and reads back', async () => {
    const r = await save(owner, profileId, {
      fileSplit: 'per_sheet',
      maxFileMb: 10,
      namingMaxLength: 30,
      namingUpper: true,
      revisionNaming: 'same_name',
      flatten: true,
      exportUnsigned: true,
      bookmarks: false,
      tocSheet: true,
      resubmittalMode: 'full_set_narrative',
      transmittal: true,
      minScaleInPerFt: 0.1875,
    });
    expect(r.error).toBeNull();
    const p = (await listSubmittalProfiles(owner.serverDb as never)).find(
      (x) => x.id === profileId,
    )!;
    expect(p).toMatchObject({
      fileSplit: 'per_sheet',
      maxFileMb: 10,
      namingMaxLength: 30,
      namingUpper: true,
      revisionNaming: 'same_name',
      flatten: true,
      exportUnsigned: true,
      bookmarks: false,
      tocSheet: true,
      resubmittalMode: 'full_set_narrative',
      transmittal: true,
      minScaleInPerFt: 0.1875,
    });

    // Empty = no limit.
    const clear = await save(owner, profileId, {
      maxFileMb: null,
      namingMaxLength: null,
      minScaleInPerFt: null,
    });
    expect(clear.error).toBeNull();
    const q = (await listSubmittalProfiles(owner.serverDb as never)).find(
      (x) => x.id === profileId,
    )!;
    expect([q.maxFileMb, q.namingMaxLength, q.minScaleInPerFt]).toEqual([null, null, null]);
  });

  it('the table refuses values outside its checks', async () => {
    for (const changes of [
      { file_split: 'per_page' },
      { max_file_mb: 0 },
      { naming_max_length: 256 },
      { min_scale_in_per_ft: 13 },
      { resubmittal_mode: 'all' },
      { revision_naming: 'rev_suffix' },
    ]) {
      const r = await owner.serverDb.rpc('update_submittal_profile', {
        p_id: profileId,
        p_changes: changes as never,
      });
      expect(r.error?.code, JSON.stringify(changes)).toBe('22023');
    }
  });

  it('another company cannot change these settings or see the profile', async () => {
    const r = await save(ownerB, profileId, { fileSplit: 'per_discipline', flatten: false });
    expect(r.error?.code).toBe('P0002');
    const row = await harnessSql()`select file_split, flatten from public.submittal_profile
      where id = ${profileId}::uuid`;
    expect(row[0]).toEqual({ file_split: 'per_sheet', flatten: true });
    const seen = await listSubmittalProfiles(ownerB.serverDb as never);
    expect(seen.some((x) => x.id === profileId)).toBe(false);
  });
});
