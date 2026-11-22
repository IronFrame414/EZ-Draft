// EZD-914 (S12 Data shown "Supplier files"; Q-0323 "EZD-132 keeps See company costs on supplier files and order
// reports"; EZD-322; CLAUDE.md rule 4) on the local stack: the Supplier files panel's list through a member's own
// client. Expected: only supplier files (supplier PDFs, order reports, and uploads carrying a supplier name) that are
// finished uploads, newest first; nothing without See company costs; another company's files never appear.
import { randomUUID } from 'node:crypto';
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
import { StorageError, type DbClient } from './index';
import { listSupplierFiles } from './source-files';

const db = (s: Session) => s.serverDb as unknown as DbClient;

async function addFile(
  tenant: string,
  project: string,
  o: { kind: string; name: string; type: string; supplier?: string; uploadedAt?: string | null },
): Promise<string> {
  const id = randomUUID();
  const uploadedAt = o.uploadedAt === undefined ? new Date().toISOString() : o.uploadedAt;
  await harnessSql()`
    insert into public.source_file
      (id, tenant_id, project_id, kind, storage_path, original_name, content_type, size_bytes, supplier_name,
       uploaded_at)
    values (${id}::uuid, ${tenant}::uuid, ${project}::uuid, ${o.kind}, ${`${tenant}/${project}/${id}`}, ${o.name},
      ${o.type}, 1000, ${o.supplier ?? null}, ${uploadedAt}::timestamptz)`;
  return id;
}

describe('EZD-914 supplier files list (helper, db)', () => {
  let tenant = '';
  let project = '';
  let otherTenant = '';
  let otherProject = '';
  let sCosts: Session;
  let sNoCosts: Session;
  let sOther: Session;
  let costsUser = '';
  let noCostsUser = '';
  let otherUser = '';
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    otherTenant = await createTenant();
    [otherProject] = await createProjects(otherTenant, 1);
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    const f = await createMember({ tenantId: tenant, scope: 'all' });
    const o = await createMember({ tenantId: otherTenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, ['view_projects', 'see_company_costs']);
    await setPermissions(tenant, f.membershipId, ['view_projects']);
    await setPermissions(otherTenant, o.membershipId, ['view_projects', 'see_company_costs']);
    [costsUser, noCostsUser, otherUser] = [a.appUserId, f.appUserId, o.appUserId];
    sCosts = await signIn(a.email);
    sNoCosts = await signIn(f.email);
    sOther = await signIn(o.email);
    ids.report = await addFile(tenant, project, {
      kind: 'order_report',
      name: '2020_order_report.pdf',
      type: 'application/pdf',
      uploadedAt: '2026-10-08T10:00:00Z',
    });
    ids.render = await addFile(tenant, project, {
      kind: 'image',
      name: '2020_persp_02.png',
      type: 'image/png',
      supplier: 'Cabinet Co',
      uploadedAt: '2026-10-08T11:00:00Z',
    });
    ids.elev = await addFile(tenant, project, {
      kind: 'dxf',
      name: '2020_elevations.dxf',
      type: 'image/vnd.dxf',
      supplier: 'Cabinet Co',
      uploadedAt: '2026-10-08T09:00:00Z',
    });
    // Not supplier files: a site photo and an architect's DXF without a supplier, and an unfinished upload.
    await addFile(tenant, project, { kind: 'photo', name: 'site.jpg', type: 'image/jpeg' });
    await addFile(tenant, project, { kind: 'dxf', name: 'architect.dxf', type: 'image/vnd.dxf' });
    await addFile(tenant, project, {
      kind: 'supplier_pdf',
      name: 'pending.pdf',
      type: 'application/pdf',
      uploadedAt: null,
    });
    ids.otherCompany = await addFile(otherTenant, otherProject, {
      kind: 'supplier_pdf',
      name: 'theirs.pdf',
      type: 'application/pdf',
    });
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('EZD-914 D1 lists the finished supplier files of the project, newest first, with the supplier fields', async () => {
    const files = await listSupplierFiles(db(sCosts), costsUser, project);
    expect(files.map((f) => f.originalName)).toEqual([
      '2020_persp_02.png',
      '2020_order_report.pdf',
      '2020_elevations.dxf',
    ]);
    expect(files[0]).toMatchObject({
      id: ids.render,
      kind: 'image',
      supplierName: 'Cabinet Co',
      supplierContactEmail: null,
      sizeBytes: 1000,
    });
  });

  it('EZD-914 D2 a member without See company costs is refused (Q-0323)', async () => {
    const err = await listSupplierFiles(db(sNoCosts), noCostsUser, project).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).code).toBe('permission_denied');
  });

  it('EZD-914 D3 another company never sees the project files, and its own stay out of this list (rule 4)', async () => {
    expect(await listSupplierFiles(db(sOther), otherUser, project)).toEqual([]);
    const own = await listSupplierFiles(db(sCosts), costsUser, otherProject);
    expect(own).toEqual([]);
    const theirs = await listSupplierFiles(db(sOther), otherUser, otherProject);
    expect(theirs.map((f) => f.id)).toEqual([ids.otherCompany]);
  });
});
