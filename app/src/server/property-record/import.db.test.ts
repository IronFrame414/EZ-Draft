// EZD-711 (AC-EZD-711-1 "Confirmed fields fill the title block"; AC-EZD-711-2 "year built 1975 sets the lead flag";
// S01 Property appraiser link "user confirms each field"; S13 Data shown "owner, PCN (From property appraiser link)";
// S13 Decision 9 "Property appraiser import needs Edit model"), local stack. The read fields are the recorded page's
// (fixtures/pbc-page.ts); the title block is EZD-710's loadProjectTitleBlock under the member's session.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { confirmedFields } from '../../lib/property-record/property-record';
import type { Database } from '../db/database.types';
import { loadProjectTitleBlock } from '../title-block/sheet-title-block';
import { PBC_FIXTURE_FIELDS, PBC_FIXTURE_URL } from './fixtures/pbc-page';
import { loadProjectPropertyRecord, saveProjectPropertyRecord } from './record';

const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;
const READ = { ...PBC_FIXTURE_FIELDS };

describe('EZD-711 property appraiser import on the local stack', () => {
  let tenantA = '';
  let p1 = '';
  let p2 = '';
  let p3 = '';
  let editor: Member;
  let editorS: Session;

  beforeAll(async () => {
    tenantA = await createTenant();
    [p1, p2, p3] = await createProjects(tenantA, 3);
    editor = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, editor.membershipId, ['view_projects', 'edit_model']);
    editorS = await signIn(editor.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-EZD-711-1 confirmed owner and parcel fill the title block', async () => {
    const before = await loadProjectTitleBlock(db(editorS), p1, editor);
    expect(before?.owner).toBeNull();
    expect(before?.parcel).toBeNull();

    const saved = await saveProjectPropertyRecord(db(editorS), p1, {
      fields: confirmedFields(READ, new Set(['parcelNo', 'owner', 'yearBuilt'])),
      sourceUrl: PBC_FIXTURE_URL,
    });
    expect(saved).toMatchObject({ ok: true, tenantId: tenantA, fields: ['parcelNo', 'owner', 'yearBuilt'] });

    const tb = await loadProjectTitleBlock(db(editorS), p1, editor);
    expect(tb?.owner).toBe('HENDRICKS FAMILY TRUST');
    expect(tb?.parcel).toBe('00-43-44-21-01-000-0010');

    const row = await adminDb()
      .from('property_record')
      .select('tenant_id, parcel_no, owner, legal_description, year_built, living_area, source_url, confirmed_by')
      .eq('id', saved.ok ? saved.recordId : '')
      .single();
    expect(row.data).toEqual({
      tenant_id: tenantA,
      parcel_no: '00-43-44-21-01-000-0010',
      owner: 'HENDRICKS FAMILY TRUST',
      legal_description: null,
      year_built: 1975,
      living_area: null,
      source_url: PBC_FIXTURE_URL,
      confirmed_by: editor.appUserId,
    });
  });

  it('an unticked owner does not reach the title block', async () => {
    await saveProjectPropertyRecord(db(editorS), p2, {
      fields: confirmedFields(READ, new Set(['parcelNo'])),
      sourceUrl: null,
    });
    const tb = await loadProjectTitleBlock(db(editorS), p2, editor);
    expect(tb?.parcel).toBe('00-43-44-21-01-000-0010');
    expect(tb?.owner).toBeNull();
  });

  it('AC-EZD-711-2 year built 1975 sets the lead flag', async () => {
    const rec = await loadProjectPropertyRecord(db(editorS), p1);
    expect(rec?.fields.yearBuilt).toBe(1975);
    expect(rec?.leadFlag).toBe(true);
  });

  it('year built 1978 or blank leaves the lead flag off', async () => {
    expect((await loadProjectPropertyRecord(db(editorS), p2))?.leadFlag).toBe(false);
    await saveProjectPropertyRecord(db(editorS), p3, {
      fields: { ...confirmedFields(READ, new Set(['owner'])), yearBuilt: 1978 },
      sourceUrl: null,
    });
    expect((await loadProjectPropertyRecord(db(editorS), p3))?.leadFlag).toBe(false);
  });

  it('a second import replaces the fields of the same record', async () => {
    const first = await adminDb().from('project').select('property_record_id').eq('id', p1).single();
    const again = await saveProjectPropertyRecord(db(editorS), p1, {
      fields: confirmedFields(READ, new Set(['owner', 'livingArea'])),
      sourceUrl: null,
    });
    expect(again.ok && again.recordId).toBe(first.data?.property_record_id);
    const rec = await loadProjectPropertyRecord(db(editorS), p1);
    expect(rec?.fields).toEqual({
      parcelNo: null,
      owner: 'HENDRICKS FAMILY TRUST',
      legalDescription: null,
      yearBuilt: null,
      livingArea: 2140,
    });
    expect(rec?.leadFlag).toBe(false);
    const count = await adminDb()
      .from('property_record')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantA);
    expect(count.count).toBe(3);
  });
});
