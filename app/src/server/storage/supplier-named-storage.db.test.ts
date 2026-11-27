// EZD-2005 (security audit 2026-11-27 S1; AC-EZD-2005-1..3) on the local stack. The sources Storage policies
// treat a source file as a cost file by the same test as the app (source-files.ts startSourceFileUpload): kind
// supplier_pdf or order_report, or supplier_name or supplier_contact_email set. A supplier-named image or DXF is
// read through Storage only by a member of the company whose own See company costs switch is on (K, read live);
// another company's member reads it neither with nor without the switch (rule 4). Members act through serverDb
// (gate header sent), so the Storage policies apply. Objects are removed with the secret-key client, rows with
// cleanup(). Tests run in file order.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
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
import type { SourceFileKind } from '../../lib/storage/source-file-kinds';
import { uploadFile } from '../../lib/storage/upload';
import {
  completeSourceFileUpload,
  createSignedUpload,
  readObject,
  signedDownloadUrl,
  sourceFilePath,
  startSourceFileUpload,
  statObject,
  StorageError,
  type DbClient,
  type SourceFileView,
  type StartSourceFileInput,
} from './index';

const PNG = 'image/png';
const DXF = 'image/vnd.dxf';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const db = (s: Session) => s.serverDb as unknown as DbClient;
const sources = (path: string) => ({ bucket: 'sources' as const, path });

async function storageCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof StorageError) return e.code;
    throw e;
  }
  return 'ok';
}

describe('EZD-2005 Storage hides supplier-named files from members without See company costs (db)', () => {
  let tA = '';
  let tB = '';
  let pA = '';
  let a: Member; // company A, See company costs on
  let f: Member; // company A, See company costs off
  let b: Member; // company B, switch toggled per test
  let sA: Session;
  let sF: Session;
  let sB: Session;
  const objects: string[] = [];

  const imageBytes = new Uint8Array(randomBytes(120));
  const dxfBytes = new Uint8Array(randomBytes(140));
  const plainImageBytes = new Uint8Array(randomBytes(90));
  const plainDxfBytes = new Uint8Array(randomBytes(110));
  let namedImage: SourceFileView;
  let emailDxf: SourceFileView;
  let plainImage: SourceFileView;
  let plainDxf: SourceFileView;

  async function upload(
    s: Session,
    who: Member,
    kind: SourceFileKind,
    contentType: string,
    bytes: Uint8Array<ArrayBuffer>,
    extra: Partial<StartSourceFileInput> = {},
  ): Promise<SourceFileView> {
    const { sourceFile, upload: signed } = await startSourceFileUpload(db(s), {
      projectId: pA,
      kind,
      originalName: kind === 'dxf' ? 'cabinets.dxf' : 'layout.png',
      contentType,
      size: bytes.length,
      uploadedBy: who.appUserId,
      ...extra,
    });
    objects.push(sourceFile.storagePath);
    await uploadFile(signed, new Blob([bytes]), { contentType });
    return completeSourceFileUpload(db(s), sourceFile.id);
  }

  // A pending row written past the app's own check, so only the Storage insert policy decides the signing.
  async function pendingRow(who: Member, kind: SourceFileKind, contentType: string, supplier: {
    name?: string;
    email?: string;
  }): Promise<string> {
    const id = randomUUID();
    const path = sourceFilePath(tA, pA, id);
    await harnessSql()`
      insert into public.source_file
        (id, tenant_id, project_id, kind, storage_path, original_name, content_type, size_bytes,
         uploaded_by, supplier_name, supplier_contact_email)
      values (${id}::uuid, ${tA}::uuid, ${pA}::uuid, ${kind}, ${path}, 'named.png', ${contentType}, 100,
        ${who.appUserId}::uuid, ${supplier.name ?? null}, ${supplier.email ?? null})`;
    objects.push(path);
    return path;
  }

  async function listedNames(s: Session): Promise<string[]> {
    const listed = await s.serverDb.storage.from('sources').list(`${tA}/${pA}`);
    return (listed.data ?? []).map((o) => o.name);
  }

  async function reads(s: Session, file: SourceFileView): Promise<Uint8Array | null> {
    return readObject(db(s), sources(file.storagePath));
  }

  beforeAll(async () => {
    tA = await createTenant();
    tB = await createTenant();
    [pA] = await createProjects(tA, 1);
    await createProjects(tB, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    f = await createMember({ tenantId: tA, scope: 'all' });
    b = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tA, a.membershipId, ['edit_model', 'see_company_costs']);
    await setPermissions(tA, f.membershipId, ['edit_model']);
    await setPermissions(tB, b.membershipId, ['edit_model', 'see_company_costs']);
    sA = await signIn(a.email);
    sF = await signIn(f.email);
    sB = await signIn(b.email);

    namedImage = await upload(sA, a, 'image', PNG, imageBytes, { supplierName: 'Acme Supply' });
    emailDxf = await upload(sA, a, 'dxf', DXF, dxfBytes, {
      supplierContactEmail: 'orders@acme.example',
    });
    plainImage = await upload(sF, f, 'image', PNG, plainImageBytes);
    plainDxf = await upload(sF, f, 'dxf', DXF, plainDxfBytes);
  });

  afterAll(async () => {
    try {
      if (objects.length) await adminDb().storage.from('sources').remove(objects);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('AC-EZD-2005-2 a member without See company costs cannot list or download a supplier-named image or DXF through Storage', async () => {
    const names = await listedNames(sF);
    expect(names).not.toContain(namedImage.id);
    expect(names).not.toContain(emailDxf.id);
    for (const file of [namedImage, emailDxf]) {
      expect(await reads(sF, file), file.kind).toBeNull();
      expect(await statObject(db(sF), sources(file.storagePath)), file.kind).toBeNull();
      expect(await storageCode(signedDownloadUrl(db(sF), sources(file.storagePath))), file.kind).toBe(
        'object_not_found',
      );
    }
  });

  it('AC-EZD-2005-2 a member with See company costs lists and downloads them byte for byte', async () => {
    const names = await listedNames(sA);
    expect(names).toContain(namedImage.id);
    expect(names).toContain(emailDxf.id);
    expect(sha((await reads(sA, namedImage)) ?? new Uint8Array())).toBe(sha(imageBytes));
    expect(sha((await reads(sA, emailDxf)) ?? new Uint8Array())).toBe(sha(dxfBytes));
    const url = await signedDownloadUrl(db(sA), sources(namedImage.storagePath));
    expect(url.length).toBeGreaterThan(0);
  });

  it('AC-EZD-2005-2 another company’s member cannot list or download them, with or without the switch (rule 4)', async () => {
    for (const granted of [true, false]) {
      await setPermissions(tB, b.membershipId, granted ? ['edit_model', 'see_company_costs'] : ['edit_model']);
      expect(await listedNames(sB), `B switch ${granted}`).toEqual([]);
      for (const file of [namedImage, emailDxf, plainImage]) {
        expect(await reads(sB, file), `${file.kind} B switch ${granted}`).toBeNull();
        expect(
          await storageCode(signedDownloadUrl(db(sB), sources(file.storagePath))),
          `${file.kind} B switch ${granted}`,
        ).toBe('object_not_found');
      }
    }
  });

  it('AC-EZD-2005-1 the insert policy refuses to sign a supplier-named pending row for a member without the switch', async () => {
    const named = await pendingRow(f, 'image', PNG, { name: 'Acme Supply' });
    const emailed = await pendingRow(f, 'dxf', DXF, { email: 'orders@acme.example' });
    expect(await storageCode(createSignedUpload(db(sF), sources(named)))).toBe('upload_refused');
    expect(await storageCode(createSignedUpload(db(sF), sources(emailed)))).toBe('upload_refused');

    // Control: the same row shape started by a member with the switch is signed.
    const own = await pendingRow(a, 'image', PNG, { name: 'Acme Supply' });
    const signed = await createSignedUpload(db(sA), sources(own));
    expect(signed.token.length).toBeGreaterThan(0);
  });

  it('AC-EZD-2005-2 another company’s member cannot put bytes under a supplier-named row of this company, with or without the switch (rule 4)', async () => {
    // uploaded_by = B, so the uploader match holds and only the company path check can refuse.
    const foreign = await pendingRow(b, 'image', PNG, { name: 'Acme Supply' });
    for (const granted of [true, false]) {
      await setPermissions(tB, b.membershipId, granted ? ['edit_model', 'see_company_costs'] : ['edit_model']);
      expect(await storageCode(createSignedUpload(db(sB), sources(foreign))), `B switch ${granted}`).toBe(
        'upload_refused',
      );
    }
  });

  it('AC-EZD-2005-3 non-supplier images and DXFs upload and download as before for a member without the switch', async () => {
    const names = await listedNames(sF);
    expect(names).toContain(plainImage.id);
    expect(names).toContain(plainDxf.id);
    expect(sha((await reads(sF, plainImage)) ?? new Uint8Array())).toBe(sha(plainImageBytes));
    expect(sha((await reads(sF, plainDxf)) ?? new Uint8Array())).toBe(sha(plainDxfBytes));
    const pending = await pendingRow(f, 'image', PNG, {});
    const signed = await createSignedUpload(db(sF), sources(pending));
    expect(signed.token.length).toBeGreaterThan(0);
  });

  it('AC-EZD-2005-2 the switch is read live: granting F See company costs shows the supplier-named files in the same session', async () => {
    await setPermissions(tA, f.membershipId, ['edit_model', 'see_company_costs']);
    expect(sha((await reads(sF, namedImage)) ?? new Uint8Array())).toBe(sha(imageBytes));
    expect(await listedNames(sF)).toContain(emailDxf.id);
  });
});
