// EZD-301 (AC-EZD-301-2; 08 Imports "Originals are always stored unchanged"; Q-0517; S01 Events emitted
// import.started) on the local stack. Members sign in with EZD-006's fixtures and act through serverDb, so RLS and
// the Storage policies apply. Expected: a DXF and a GLB sent through the Upload step's calls download
// byte-identical (sha-256 and length of random bytes); a kind refuses another kind's content type (Q-0517); an
// import starts only from this project's uploaded files, and one company cannot start an import on another's
// project or with another's file.
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { uploadFile } from '../../lib/storage/upload';
import {
  completeSourceFileUpload,
  startSourceFileUpload,
  StorageError,
  type DbClient,
  type SourceFileView,
} from '../storage';
import type { SourceFileKind } from '../../lib/storage/source-file-kinds';
import { checkImportFiles } from './start-import';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const db = (s: Session) => s.serverDb as unknown as DbClient;

describe('EZD-301 upload step on the local stack', () => {
  const paths: string[] = [];
  let tA = '';
  let pA = '';
  let pA2 = '';
  let pB = '';
  let a: Member;
  let b: Member;
  let sA: Session;
  let sB: Session;
  const dxf = new Uint8Array(randomBytes(70_001));
  const glb = new Uint8Array(randomBytes(130_003));
  let dxfRow: SourceFileView;
  let glbRow: SourceFileView;
  let pending: SourceFileView;
  let bRow: SourceFileView;

  async function send(
    s: Session,
    projectId: string,
    who: Member,
    kind: SourceFileKind,
    contentType: string,
    name: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<SourceFileView> {
    const { sourceFile, upload } = await startSourceFileUpload(db(s), {
      projectId,
      kind,
      originalName: name,
      contentType,
      size: bytes.length,
      uploadedBy: who.appUserId,
    });
    paths.push(sourceFile.storagePath);
    await uploadFile(upload, new Blob([bytes]), { contentType });
    return completeSourceFileUpload(db(s), sourceFile.id);
  }

  beforeAll(async () => {
    tA = await createTenant();
    const tB = await createTenant();
    [pA, pA2] = await createProjects(tA, 2);
    [pB] = await createProjects(tB, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    b = await createMember({ tenantId: tB, scope: 'all' });
    sA = await signIn(a.email);
    sB = await signIn(b.email);
  });

  afterAll(async () => {
    try {
      if (paths.length > 0) await adminDb().storage.from('sources').remove(paths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('EZD-301 D1 a Polycam DXF and GLB are stored byte-identical (AC-EZD-301-2)', async () => {
    dxfRow = await send(sA, pA, a, 'polycam_dxf', 'image/vnd.dxf', 'scan.dxf', dxf);
    glbRow = await send(sA, pA, a, 'polycam_glb', 'model/gltf-binary', 'scan.glb', glb);
    for (const [row, bytes] of [
      [dxfRow, dxf],
      [glbRow, glb],
    ] as const) {
      expect(row.uploadedAt).not.toBeNull();
      expect(row.sizeBytes).toBe(bytes.length);
      const { data, error } = await adminDb().storage.from('sources').download(row.storagePath);
      expect(error).toBeNull();
      const got = new Uint8Array(await (data as Blob).arrayBuffer());
      expect(got.length).toBe(bytes.length);
      expect(sha(got)).toBe(sha(bytes));
    }
  });

  it('EZD-301 D2 a kind refuses another kind’s content type (Q-0517)', async () => {
    const refused: Array<[SourceFileKind, string]> = [
      ['order_report', 'image/png'],
      ['field_measure', 'application/pdf'],
      ['polycam_dxf', 'application/pdf'],
      ['polycam_glb', 'image/vnd.dxf'],
      ['pdf', 'image/jpeg'],
    ];
    for (const [kind, contentType] of refused) {
      const err = await startSourceFileUpload(db(sA), {
        projectId: pA,
        kind,
        originalName: 'x',
        contentType,
        size: 10,
        uploadedBy: a.appUserId,
      }).catch((e: unknown) => e);
      expect(err, `${kind} ${contentType}`).toBeInstanceOf(StorageError);
      expect((err as StorageError).code, `${kind} ${contentType}`).toBe('invalid_input');
    }
  });

  it('EZD-301 D3 an import starts only from this project’s uploaded files; never across companies', async () => {
    const started = await startSourceFileUpload(db(sA), {
      projectId: pA,
      kind: 'pdf',
      originalName: 'plan.pdf',
      contentType: 'application/pdf',
      size: 10,
      uploadedBy: a.appUserId,
    });
    pending = started.sourceFile;
    paths.push(pending.storagePath);
    bRow = await send(sB, pB, b, 'dxf', 'image/vnd.dxf', 'b.dxf', new Uint8Array(randomBytes(64)));

    expect(await checkImportFiles(db(sA), pA, [dxfRow.id, glbRow.id])).toEqual({
      ok: true,
      tenantId: tA,
      scanIds: [dxfRow.id],
      meshIds: [glbRow.id],
    });
    expect(await checkImportFiles(db(sA), pA, [dxfRow.id, pending.id])).toEqual({
      ok: false,
      code: 'upload_missing',
    });
    expect(await checkImportFiles(db(sA), pA2, [dxfRow.id])).toEqual({
      ok: false,
      code: 'source_file_not_found',
    });
    // Company B cannot see A's project, and A cannot use B's file.
    expect(await checkImportFiles(db(sB), pA, [dxfRow.id])).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect(await checkImportFiles(db(sB), pB, [dxfRow.id])).toEqual({
      ok: false,
      code: 'source_file_not_found',
    });
    expect(await checkImportFiles(db(sA), pA, [bRow.id])).toEqual({
      ok: false,
      code: 'source_file_not_found',
    });
    expect(await checkImportFiles(db(sB), pB, [bRow.id])).toMatchObject({ ok: true });
  });
});
