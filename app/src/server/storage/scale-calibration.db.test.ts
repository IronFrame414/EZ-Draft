// EZD-304 (S01 PDF: scale calibration "Stored in source_file.scale_calibration"; CLAUDE.md rule 4): setPdfScale,
// readPdfScale and listProjectPdfs through members' own clients, so RLS and the source_file trigger apply. Expected:
// a member stores the scale of a finished PDF and reads it back with a link; another company and a member whose list
// leaves the project out neither read nor change it (not found, the row unchanged); a supplier PDF, an unfinished
// upload and a calibration that cannot measure are refused. The calibration is
// the vector fixture's south face (216 pt = 144 in, fixtures/synthetic/room-12x10-vector.pdf.expected.json).
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { uploadFile } from '../../lib/storage/upload';
import {
  completeSourceFileUpload,
  listProjectPdfs,
  readPdfScale,
  setPdfScale,
  startSourceFileUpload,
  StorageError,
  type DbClient,
  type SourceFileView,
} from './index';

const db = (s: Session) => s.serverDb as unknown as DbClient;
const CAL = { page: 1, a: [504, 300], b: [720, 300], lengthIn: 144 };

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    return e instanceof StorageError ? e.code : String(e);
  }
}

describe('EZD-304 PDF scale calibration in source_file', () => {
  const objects: string[] = [];
  let pA = '';
  let pA2 = '';
  let a: Member;
  let sA: Session;
  let sB: Session;
  let sL: Session;

  beforeAll(async () => {
    const tA = await createTenant();
    const tB = await createTenant();
    [pA, pA2] = await createProjects(tA, 2);
    a = await createMember({ tenantId: tA, scope: 'all' });
    const b = await createMember({ tenantId: tB, scope: 'all' });
    const listed = await createMember({ tenantId: tA, scope: 'listed', listed: [pA2] });
    sA = await signIn(a.email);
    sB = await signIn(b.email);
    sL = await signIn(listed.email);
  });

  afterAll(async () => {
    try {
      if (objects.length > 0) await adminDb().storage.from('sources').remove(objects);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  async function upload(kind: 'pdf', finish = true): Promise<SourceFileView> {
    const { sourceFile, upload: signed } = await startSourceFileUpload(db(sA), {
      projectId: pA,
      kind,
      originalName: `${kind}.pdf`,
      contentType: 'application/pdf',
      size: 512,
      uploadedBy: a.appUserId,
    });
    await uploadFile(signed, new Blob([new Uint8Array(randomBytes(512))]), {
      contentType: 'application/pdf',
    });
    objects.push(sourceFile.storagePath);
    return finish ? completeSourceFileUpload(db(sA), sourceFile.id) : sourceFile;
  }

  const stored = async (id: string) => {
    const [row] = await harnessSql()<{ scale_calibration: unknown; original_name: string }[]>`
      select scale_calibration, original_name from public.source_file where id = ${id}::uuid`;
    return row;
  };

  it('a member stores the scale of a finished PDF and reads it back with a link', async () => {
    const pdf = await upload('pdf');
    expect((await listProjectPdfs(db(sA), pA)).map((p) => [p.id, p.scaleCalibration])).toEqual([
      [pdf.id, null],
    ]);
    const set = await setPdfScale(db(sA), pdf.id, CAL);
    expect(set).toMatchObject({
      id: pdf.id,
      projectId: pA,
      originalName: 'pdf.pdf',
      scaleCalibration: CAL,
    });
    expect((await stored(pdf.id)).scale_calibration).toEqual(CAL);
    const read = await readPdfScale(db(sA), pdf.id);
    expect(read.scaleCalibration).toEqual(CAL);
    expect(read.url).toMatch(/^https?:\/\//);
    expect((await listProjectPdfs(db(sA), pA))[0].scaleCalibration).toEqual(CAL);
  });

  it('another company, or a member whose list leaves the project out, neither reads nor changes the scale', async () => {
    const pdf = await upload('pdf');
    await setPdfScale(db(sA), pdf.id, CAL);
    const other = { ...CAL, lengthIn: 12 };
    for (const s of [sB, sL]) {
      expect(await code(setPdfScale(db(s), pdf.id, other))).toBe('source_file_not_found');
      expect(await code(readPdfScale(db(s), pdf.id))).toBe('source_file_not_found');
      expect(await listProjectPdfs(db(s), pA)).toEqual([]);
      // Straight at the table, the update reaches no row.
      const direct = await s.serverDb
        .from('source_file')
        .update({ scale_calibration: other })
        .eq('id', pdf.id)
        .select('id');
      expect(direct.data ?? []).toEqual([]);
    }
    expect((await stored(pdf.id)).scale_calibration).toEqual(CAL);
  });

  it('a supplier PDF, an unfinished upload and a calibration that cannot measure are refused', async () => {
    const [{ tenant_id: tA }] = await harnessSql()<{ tenant_id: string }[]>`
      select tenant_id from public.project where id = ${pA}::uuid`;
    const supplierId = randomUUID();
    const made = await adminDb()
      .from('source_file')
      .insert({
        id: supplierId,
        tenant_id: tA,
        project_id: pA,
        kind: 'supplier_pdf',
        storage_path: `${tA}/${pA}/${supplierId}`,
        original_name: 'supplier.pdf',
        content_type: 'application/pdf',
        size_bytes: 1,
        uploaded_at: new Date().toISOString(),
      });
    expect(made.error).toBeNull();
    expect(await code(setPdfScale(db(sA), supplierId, CAL))).toBe('source_file_not_found');
    expect((await stored(supplierId)).scale_calibration).toBeNull();
    const pending = await upload('pdf', false);
    expect(await code(setPdfScale(db(sA), pending.id, CAL))).toBe('source_file_not_found');
    const pdf = await upload('pdf');
    expect(await code(setPdfScale(db(sA), pdf.id, { ...CAL, b: CAL.a }))).toBe('invalid_input');
    expect(await code(setPdfScale(db(sA), pdf.id, { ...CAL, lengthIn: 0 }))).toBe('invalid_input');
    expect(await code(setPdfScale(db(sA), 'nope', CAL))).toBe('source_file_not_found');
    expect((await stored(pdf.id)).scale_calibration).toBeNull();
    expect((await stored(pending.id)).scale_calibration).toBeNull();
  });
});
