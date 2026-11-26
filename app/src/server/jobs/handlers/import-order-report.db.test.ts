// EZD-916 on the local stack (S12 Order report import "Reads codes, sizes, finishes and order line numbers; lines become
// the reference for tags"; Decisions 2 "Lines are read by text extraction plus AI and shown in Import review for the
// user to confirm"; AC-EZD-916-1 "A sample report's lines appear in review for confirmation").
// The fixture report is uploaded as an order report (kind order_report, with its supplier, by a member with See
// company costs), the import job reads it with the built-in AI stub (recordings/order-report.ts), and Import review
// (readImportReview through the member's client) lists its lines. Finish writes them to order_line and makes no model
// version. Expected values: fixtures/synthetic/order-report.pdf.expected.json (hand-written from the generator's
// table: 22 lines, every code and width printed on its own row, so each line is 95% confident) and
// vault/build/assumptions.md EZD-916 (AC-1 numbers: 22 order_line items in review; after Finish 22 rows and the file
// row reads "22 lines read"; Finish needs See company costs; order_line is read in scope and written only by Finish).
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../../test-harness/jobs/queue-lock';
import { expectSafeToRunTwice } from '../../../../test-harness/jobs/run-twice';
import { setPermissions } from '../../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../../test-harness/rls/isolation';
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
import type { ReviewOrderLine } from '../../../lib/imports/review';
import { uploadFile } from '../../../lib/storage/upload';
import { finishImport, ImportCloseError } from '../../imports/finish-import';
import { importReadsOrderReport, readImportReview, saveImportReview } from '../../imports/review';
import {
  completeSourceFileUpload,
  startSourceFileUpload,
  type DbClient,
  type SourceFileView,
} from '../../storage';
import { listSupplierFiles } from '../../storage/source-files';

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

type ExpectedLine = {
  lineNo: number;
  code: string;
  width: number;
  face: string | null;
  finish: string | null;
};

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FIXTURE = path.join(repo, 'fixtures/synthetic/order-report.pdf');
const expected = JSON.parse(readFileSync(`${FIXTURE}.expected.json`, 'utf8')) as {
  confidence: number;
  lines: ExpectedLine[];
};
const db = (s: Session) => s.serverDb as unknown as DbClient;

// This file leaves due job rows in the queue, so it holds the shared job-queue lock for its whole run
// (test-harness/jobs/README.md): the unscoped sweep tests then never claim them.
let releaseJobQueue: (() => Promise<void>) | undefined;
beforeAll(async () => {
  releaseJobQueue = await holdJobQueueShared();
}, 180000);
afterAll(async () => {
  await releaseJobQueue?.();
});

describe('EZD-916 order report import', () => {
  const paths: string[] = [];
  let tA = '';
  let pA = '';
  let a: Member;
  let sA: Session;
  let noCosts: Session;
  let file: SourceFileView;

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

  async function readJob(jobId: string) {
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [file.id] },
      job: { id: jobId, tenant_id: tA, project_id: pA, kind: 'import' },
    });
    await adminDb().from('job').update({ status: 'done' }).eq('id', jobId);
  }

  const acceptAll = (jobId: string, items: readonly { id: string }[], reject: string[] = []) =>
    saveImportReview(db(sA), pA, jobId, {
      mode: null,
      changes: items.map((i) => ({
        item_id: i.id,
        decision: reject.includes(i.id) ? ('rejected' as const) : ('accepted' as const),
        fix: null,
      })),
    });

  const storedLines = async () => {
    const { data, error } = await adminDb()
      .from('order_line')
      .select('tenant_id, project_id, source_file_id, line_no, code, width, face, finish')
      .eq('source_file_id', file.id)
      .order('line_no');
    if (error) throw error;
    return data;
  };

  beforeAll(async () => {
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, a.membershipId, [
      'view_projects',
      'edit_model',
      'upload_references',
      'see_company_costs',
    ]);
    sA = await signIn(a.email);
    const c = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, c.membershipId, ['view_projects', 'edit_model', 'upload_references']);
    noCosts = await signIn(c.email);
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    const { sourceFile, upload } = await startSourceFileUpload(db(sA), {
      projectId: pA,
      kind: 'order_report',
      originalName: 'order-report.pdf',
      contentType: 'application/pdf',
      size: bytes.length,
      supplierName: 'Cabinet Co',
      uploadedBy: a.appUserId,
    });
    paths.push(sourceFile.storagePath);
    await uploadFile(upload, new Blob([bytes]), { contentType: 'application/pdf' });
    file = await completeSourceFileUpload(db(sA), sourceFile.id);
  }, 60000);

  afterAll(async () => {
    try {
      if (paths.length > 0) await adminDb().storage.from('sources').remove(paths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it("AC-EZD-916-1: the sample report's lines appear in review for confirmation", async () => {
    const jobId = await newJob(tA, pA, [file.id]);
    emitted.length = 0;
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [file.id] },
      job: { id: jobId, tenant_id: tA, project_id: pA, kind: 'import' },
    });
    const { data: rows, error } = await adminDb()
      .from('import_session')
      .select('id, source_kind, status, summary, error')
      .eq('job_id', jobId);
    if (error) throw error;
    expect(rows).toEqual([
      {
        id: expect.any(String),
        source_kind: 'supplier',
        status: 'ready',
        error: null,
        summary: { lines: expected.lines.length },
      },
    ]);
    expect(emitted.filter((e) => e.name === 'import.ready')).toEqual([
      {
        name: 'import.ready',
        payload: {
          projectId: pA,
          importSessionIds: [rows![0].id],
          counts: { walls: 0, openings: 0, rooms: 0 },
        },
      },
    ]);

    await adminDb().from('job').update({ status: 'done' }).eq('id', jobId);
    const view = await readImportReview(db(sA), pA, jobId);
    expect(view).not.toBeNull();
    expect(view!.status).toBe('ready');
    expect(view!.files).toEqual([{ name: 'order-report.pdf', kind: 'order_report' }]);
    const shown = view!.items.filter((i): i is ReviewOrderLine => i.type === 'order_line');
    expect(shown).toHaveLength(22);
    expect(shown.map(({ lineNo, code, width, face, finish }) => ({ lineNo, code, width, face, finish }))).toEqual(
      expected.lines,
    );
    for (const line of shown) {
      expect(line.confidence, `line ${line.lineNo}`).toBe(expected.confidence);
      expect(line.confidence).toBeGreaterThanOrEqual(view!.cutoff);
    }
    // The routes ask this before a review read or save, to require See company costs (Q-0323).
    expect(await importReadsOrderReport(db(sA), pA, jobId)).toBe(true);
    expect(await importReadsOrderReport(db(noCosts), pA, jobId)).toBe(true);
    expect(await importReadsOrderReport(db(sA), pA, randomUUID())).toBe(false);
    // Nothing is stored as a confirmed line until Finish.
    expect(await storedLines()).toEqual([]);
    const listed = await listSupplierFiles(db(sA), a.appUserId, pA);
    expect(listed.find((f) => f.id === file.id)?.linesRead).toBe(0);

    // Finish needs See company costs as well as Edit model.
    expect(await acceptAll(jobId, shown)).toBe('saved');
    await expect(finishImport(db(noCosts), pA, jobId, a.appUserId)).rejects.toEqual(
      new ImportCloseError('permission_denied'),
    );

    const versionsBefore = await adminDb().from('model_version').select('id').eq('project_id', pA);
    const done = await finishImport(db(sA), pA, jobId, a.appUserId);
    expect(done).toMatchObject({
      status: 'finished',
      modelVersionId: null,
      orderLines: 22,
      objectIds: [],
      counts: { accepted: 22, deleted: 0 },
    });
    const versionsAfter = await adminDb().from('model_version').select('id').eq('project_id', pA);
    expect(versionsAfter.data).toEqual(versionsBefore.data);
    expect(await storedLines()).toEqual(
      expected.lines.map((l) => ({
        tenant_id: tA,
        project_id: pA,
        source_file_id: file.id,
        line_no: l.lineNo,
        code: l.code,
        width: l.width,
        face: l.face,
        finish: l.finish,
      })),
    );
    const after = await listSupplierFiles(db(sA), a.appUserId, pA);
    expect(after.find((f) => f.id === file.id)?.linesRead).toBe(22);
  });

  it('a second read of the same report replaces its lines with the accepted ones only', async () => {
    const jobId = await newJob(tA, pA, [file.id]);
    await readJob(jobId);
    const view = await readImportReview(db(sA), pA, jobId);
    const items = view!.items;
    expect(await acceptAll(jobId, items, ['ol21', 'ol22'])).toBe('saved');
    const done = await finishImport(db(sA), pA, jobId, a.appUserId);
    expect(done).toMatchObject({ status: 'finished', modelVersionId: null, orderLines: 20 });
    expect((await storedLines()).map((l) => l.line_no)).toEqual(expected.lines.slice(0, 20).map((l) => l.lineNo));
  });

  it("another company's member cannot read or finish this company's order report import", async () => {
    const jobId = await newJob(tA, pA, [file.id]);
    await readJob(jobId);
    const tB = await createTenant();
    const b = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tB, b.membershipId, ['view_projects', 'edit_model', 'see_company_costs']);
    const sB = await signIn(b.email);
    expect(await readImportReview(db(sB), pA, jobId)).toBeNull();
    await expect(finishImport(db(sB), pA, jobId, b.appUserId)).resolves.toEqual({ status: 'not_found' });
    const seen = await db(sB).from('order_line').select('id').eq('project_id', pA);
    expect(seen.error).toBeNull();
    expect(seen.data).toEqual([]);
    // A member cannot write order lines directly, even in their own company (only Finish writes them).
    const own = await db(sA)
      .from('order_line')
      .insert({ tenant_id: tA, project_id: pA, source_file_id: file.id, line_no: 999, code: 'B9' });
    expect(own.error?.code).toBe('42501');
  });

  describeTenantIsolation('order_line', {
    makeRow: async (t, ctx) => {
      const id = randomUUID();
      const project = ctx.projectIds[0];
      const { error } = await adminDb()
        .from('source_file')
        .insert({
          id,
          tenant_id: t,
          project_id: project,
          kind: 'order_report',
          storage_path: `${t}/${project}/${id}`,
          original_name: 'iso.pdf',
          content_type: 'application/pdf',
          size_bytes: 1,
        });
      if (error) throw error;
      return { tenant_id: t, project_id: project, source_file_id: id, line_no: 7, code: 'SB36', width: 36 };
    },
  });
});
