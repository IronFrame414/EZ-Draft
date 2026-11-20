// EZD-305 on the local stack (S01 PDF: detect type; S02 States Empty "no items detected (e.g. scanned PDF)", Error
// "import job failed: message with file name"; AC-EZD-305-1, AC-EZD-305-2). Expected values: the vector fixture's
// 6 walls (derived in app/src/server/jobs/pdf-walls/detect.test.ts from room-12x10-vector.pdf.expected.json
// `wallSegments`: north, west, east and the south wall in three pieces at the door and window gaps), each 4.5 in
// thick at the stored calibration (`calibration[0]`, 144 in over 216 pt); no openings or rooms are read from a PDF;
// source_kind `pdf` (03c import_session). The scanned fixture has no path operators (`pathOps` 0), so its session is
// ready with no items. Bytes pdf.js cannot open give a failed session with a stable code. A job of another company
// naming this company's PDF writes nothing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectSafeToRunTwice } from '../../../../test-harness/jobs/run-twice';
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
} from '../../../../test-harness/rls/fixtures';
import { uploadFile } from '../../../lib/storage/upload';
import {
  completeSourceFileUpload,
  setPdfScale,
  startSourceFileUpload,
  type DbClient,
  type SourceFileView,
} from '../../storage';

const emitted = vi.hoisted(() => [] as Array<{ name: string; payload: unknown }>);
vi.mock('../../events', async (orig) => {
  const real = await orig<typeof import('../../events')>();
  return {
    ...real,
    emit: vi.fn(async (name: string, payload: unknown, ctx: unknown) => {
      emitted.push({ name, payload });
      return real.emit(name as never, payload as never, ctx as never);
    }),
  };
});

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const VECTOR = path.join(repo, 'fixtures/synthetic/room-12x10-vector.pdf');
const SCANNED = path.join(repo, 'fixtures/synthetic/room-12x10-scanned.pdf');
const vectorExpected = JSON.parse(readFileSync(`${VECTOR}.expected.json`, 'utf8'));
const db = (s: Session) => s.serverDb as unknown as DbClient;
const WALLS = 6;

describe('EZD-305 import job reads PDFs', () => {
  const paths: string[] = [];
  let tA = '';
  let pA = '';
  let a: Member;
  let sA: Session;
  let vector: SourceFileView;
  let scanned: SourceFileView;
  let broken: SourceFileView;

  async function send(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<SourceFileView> {
    const { sourceFile, upload } = await startSourceFileUpload(db(sA), {
      projectId: pA,
      kind: 'pdf',
      originalName: name,
      contentType: 'application/pdf',
      size: bytes.length,
      uploadedBy: a.appUserId,
    });
    paths.push(sourceFile.storagePath);
    await uploadFile(upload, new Blob([bytes]), { contentType: 'application/pdf' });
    return completeSourceFileUpload(db(sA), sourceFile.id);
  }

  async function newJob(tenantId: string, projectId: string, sourceFileIds: string[]) {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        kind: 'import',
        payload: { sourceFileIds },
        max_attempts: 3,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async function sessions(jobId: string) {
    const { data, error } = await adminDb()
      .from('import_session')
      .select('id, source_file_id, source_kind, status, items, summary, error')
      .eq('job_id', jobId);
    if (error) throw error;
    return data as Array<{
      id: string;
      source_file_id: string;
      source_kind: string;
      status: string;
      items: Array<{ type: string; thickness?: number | null }>;
      summary: unknown;
      error: string | null;
    }>;
  }

  beforeAll(async () => {
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    sA = await signIn(a.email);
    vector = await send('plan.pdf', new Uint8Array(readFileSync(VECTOR)));
    scanned = await send('scan.pdf', new Uint8Array(readFileSync(SCANNED)));
    broken = await send('broken.pdf', new TextEncoder().encode('not a pdf at all'));
    const cal = vectorExpected.calibration[0];
    await setPdfScale(db(sA), vector.id, { page: 1, a: cal.from, b: cal.to, lengthIn: cal.lengthIn });
  }, 60000);

  afterAll(async () => {
    try {
      if (paths.length > 0) await adminDb().storage.from('sources').remove(paths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('AC-EZD-305-1: the fixture vector PDF gives wall items, safe to run twice, import.ready once', async () => {
    const jobId = await newJob(tA, pA, [vector.id]);
    emitted.length = 0;
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [vector.id] },
      job: { id: jobId, tenant_id: tA, project_id: pA, kind: 'import' },
    });
    const rows = await sessions(jobId);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      source_file_id: vector.id,
      source_kind: 'pdf',
      status: 'ready',
      error: null,
      summary: { walls: WALLS, openings: 0, rooms: 0 },
    });
    expect(row.items).toHaveLength(WALLS);
    for (const item of row.items) {
      expect(item.type).toBe('wall');
      expect(item.thickness).toBeCloseTo(4.5, 6);
    }
    expect(emitted.filter((e) => e.name === 'import.ready')).toEqual([
      {
        name: 'import.ready',
        payload: {
          projectId: pA,
          importSessionIds: [row.id],
          counts: { walls: WALLS, openings: 0, rooms: 0 },
        },
      },
    ]);
  });

  it('AC-EZD-305-2: the fixture scanned PDF returns zero items (a ready session, the S02 empty state)', async () => {
    const jobId = await newJob(tA, pA, [scanned.id]);
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [scanned.id] },
      job: { id: jobId, tenant_id: tA, project_id: pA, kind: 'import' },
    });
    const rows = await sessions(jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_kind: 'pdf',
      status: 'ready',
      error: null,
      items: [],
      summary: { walls: 0, openings: 0, rooms: 0 },
    });
  });

  it('bytes pdf.js cannot open give a failed session with unreadable_pdf', async () => {
    const jobId = await newJob(tA, pA, [broken.id]);
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [broken.id] },
      job: { id: jobId, tenant_id: tA, project_id: pA, kind: 'import' },
    });
    const rows = await sessions(jobId);
    expect(rows.map((r) => ({ status: r.status, error: r.error, items: r.items }))).toEqual([
      { status: 'failed', error: 'unreadable_pdf', items: [] },
    ]);
  });

  it('a job of another company naming this company’s PDF writes nothing', async () => {
    const tB = await createTenant();
    const [pB] = await createProjects(tB, 1);
    const jobId = await newJob(tB, pB, [vector.id]);
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [vector.id] },
      job: { id: jobId, tenant_id: tB, project_id: pB, kind: 'import' },
    });
    expect(await sessions(jobId)).toEqual([]);
  });
});
