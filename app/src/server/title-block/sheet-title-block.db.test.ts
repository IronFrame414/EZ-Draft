// EZD-710 (AC-EZD-710-1; CLAUDE.md rule 4): a project's title block read under the member's session, and the
// property_record table's company isolation. Expected values: S13 Data shown (company, license, project, address,
// owner, PCN), S13 Decision 6 (code edition and scope of work), S15b Decision 1 (the company switch), S15b Decision 2
// (the seven fields of a complete title block), the v1 code edition label "FBC 9th ed. · NEC 2023" (S06; EZD-613), the
// initials rule of app/src/lib/users/initials.ts ("Josh Bishop" is JB) and the migration header (a member reads a
// record only through a project they can see).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
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
import { projectTitleBlockMissing } from '../../lib/title-block/sheet-title-block';
import type { Database } from '../db/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadProjectTitleBlock } from './sheet-title-block';

const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

async function admin(table: string, op: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await op;
  if (error) throw new Error(`${table}: ${JSON.stringify(error)}`);
}

async function record(tenantId: string, owner: string, parcel: string): Promise<string> {
  const id = randomUUID();
  await admin('property_record', adminDb().from('property_record').insert({ id, tenant_id: tenantId, owner, parcel_no: parcel }));
  return id;
}

describe('EZD-710 loadProjectTitleBlock', () => {
  let tenantA = '';
  let filled = '';
  let bare = '';
  let hidden = '';
  let hiddenRecord = '';
  let all: Member;
  let allS: Session;
  let listedS: Session;
  let otherS: Session;

  beforeAll(async () => {
    tenantA = await createTenant();
    const tenantB = await createTenant();
    [filled, bare, hidden] = await createProjects(tenantA, 3);
    await admin(
      'tenant',
      adminDb()
        .from('tenant')
        .update({
          name: 'Worth Properties',
          license_no: 'CGC1541042',
          contact: { phone: '561-806-8987', website: 'worthprop.com' },
          title_block: { show_company: true },
          code_edition: null,
        })
        .eq('id', tenantA),
    );
    const rec = await record(tenantA, 'Hendricks', '00-43-44-21-01-000-0010');
    hiddenRecord = await record(tenantA, 'Someone Else', '11-11-11-11-11-111-1111');
    await admin(
      'project',
      adminDb()
        .from('project')
        .update({ name: 'Kitchen remodel', address: '336 Golfview Rd', scope_of_work: 'Kitchen remodel', property_record_id: rec })
        .eq('id', filled),
    );
    await admin('project', adminDb().from('project').update({ property_record_id: hiddenRecord }).eq('id', hidden));
    all = await createMember({ tenantId: tenantA, scope: 'all' });
    await admin('app_user', adminDb().from('app_user').update({ name: 'Josh Bishop' }).eq('id', all.appUserId));
    const listed = await createMember({ tenantId: tenantA, scope: 'listed', listed: [filled] });
    const other = await createMember({ tenantId: tenantB, scope: 'all' });
    allS = await signIn(all.email);
    listedS = await signIn(listed.email);
    otherS = await signIn(other.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-EZD-710-1 a filled project reads every title block field and is complete', async () => {
    const tb = await loadProjectTitleBlock(db(allS), filled, all);
    expect(tb).toEqual({
      company: {
        name: 'Worth Properties',
        licenseNo: 'CGC1541042',
        contact: { phone: '561-806-8987', website: 'worthprop.com' },
        logoUrl: null,
      },
      companyName: 'Worth Properties',
      licenseNo: 'CGC1541042',
      projectName: 'Kitchen remodel',
      address: '336 Golfview Rd',
      codeEdition: 'FBC 9th ed. · NEC 2023',
      scopeOfWork: 'Kitchen remodel',
      owner: 'Hendricks',
      parcel: '00-43-44-21-01-000-0010',
      drawn: 'JB',
    });
    expect(projectTitleBlockMissing(tb!)).toEqual([]);
  });

  it('a project with no property record or scope of work lists those fields as missing', async () => {
    const tb = await loadProjectTitleBlock(db(allS), bare, all);
    expect(tb?.owner).toBeNull();
    expect(tb?.parcel).toBeNull();
    expect(projectTitleBlockMissing(tb!)).toEqual(['parcel_number', 'owner', 'scope_of_work']);
  });

  it('the company switch off drops the company block (S15b Decision 1)', async () => {
    await admin('tenant', adminDb().from('tenant').update({ title_block: { show_company: false } }).eq('id', tenantA));
    try {
      const tb = await loadProjectTitleBlock(db(allS), filled, all);
      expect(tb?.company).toBeNull();
      expect(tb?.licenseNo).toBe('CGC1541042');
    } finally {
      await admin('tenant', adminDb().from('tenant').update({ title_block: { show_company: true } }).eq('id', tenantA));
    }
  });

  it('a listed member reads only the records of projects in scope; another company reads nothing', async () => {
    expect(await loadProjectTitleBlock(db(listedS), hidden, all)).toBeNull();
    const own = await listedS.serverDb.from('property_record').select('owner');
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ owner: 'Hendricks' }]);
    const direct = await listedS.serverDb.from('property_record').select('id').eq('id', hiddenRecord);
    expect(direct.data).toEqual([]);
    expect(await loadProjectTitleBlock(db(otherS), filled, all)).toBeNull();
    const other = await otherS.serverDb.from('property_record').select('id');
    expect(other.data).toEqual([]);
  });

  it('a member cannot write a property record (EZD-711 adds the write path)', async () => {
    const ins = await allS.serverDb.from('property_record').insert({ tenant_id: tenantA, owner: 'X' });
    expect(ins.error?.code).toBe('42501');
    const upd = await allS.serverDb.from('property_record').update({ owner: 'X' }).eq('id', hiddenRecord).select('id');
    expect(upd.data ?? []).toEqual([]);
  });

  describeTenantIsolation('property_record', {
    makeRow: (t) => ({ tenant_id: t, owner: 'Isolation owner', parcel_no: '22-22-22-22-22-222-2222' }),
    update: { owner: 'Changed' },
  });
});
