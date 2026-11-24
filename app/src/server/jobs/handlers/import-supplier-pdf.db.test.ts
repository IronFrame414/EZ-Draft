// EZD-915 on the local stack (S12 Supplier PDF import "result goes to Import review with confidence colors"; S02
// States "Supplier kitchen PDF: cabinet labels read (W3030, B24) and plan vs elevation cross-check results shown per
// cabinet"; AC-EZD-915-1 "The fixture supplier PDF gives cabinet boxes with sizes from labels in review").
// The fixture is uploaded as a supplier file (kind supplier_pdf, with its supplier, by a member with See company
// costs), the import job reads it, and Import review (readImportReview through the member's client) shows its
// cabinets. Expected values: fixtures/synthetic/supplier-kitchen.pdf.expected.json (hand-written from the fixture
// design: B24 base 24 x 24 x 34 1/2, W3030 wall 30 x 12 x 30, one wall) and the confidence rule of
// vault/build/assumptions.md EZD-915 (both views agree: 95, at or above the default cutoff of 80).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../../test-harness/jobs/queue-lock';
import { expectSafeToRunTwice } from '../../../../test-harness/jobs/run-twice';
import { setPermissions } from '../../../../test-harness/permissions/grant';
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
import type { ReviewCabinet } from '../../../lib/imports/review';
import { uploadFile } from '../../../lib/storage/upload';
import { readImportReview } from '../../imports/review';
import {
  completeSourceFileUpload,
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
const FIXTURE = path.join(repo, 'fixtures/synthetic/supplier-kitchen.pdf');
const expected = JSON.parse(readFileSync(`${FIXTURE}.expected.json`, 'utf8'));
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

describe('EZD-915 supplier PDF import', () => {
  const paths: string[] = [];
  let tA = '';
  let pA = '';
  let a: Member;
  let sA: Session;
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
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    const { sourceFile, upload } = await startSourceFileUpload(db(sA), {
      projectId: pA,
      kind: 'supplier_pdf',
      originalName: 'kitchen.pdf',
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

  it('AC-EZD-915-1: the fixture supplier PDF gives cabinet boxes with sizes from labels in review', async () => {
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
    const cabinets = expected.cabinets.length;
    expect(rows).toEqual([
      {
        id: expect.any(String),
        source_kind: 'supplier',
        status: 'ready',
        error: null,
        summary: { walls: expected.wall.count, openings: 0, rooms: 0, cabinets },
      },
    ]);
    expect(emitted.filter((e) => e.name === 'import.ready')).toEqual([
      {
        name: 'import.ready',
        payload: {
          projectId: pA,
          importSessionIds: [rows![0].id],
          counts: { walls: expected.wall.count, openings: 0, rooms: 0, cabinets },
        },
      },
    ]);

    await adminDb().from('job').update({ status: 'done' }).eq('id', jobId);
    const view = await readImportReview(db(sA), pA, jobId);
    expect(view).not.toBeNull();
    expect(view!.status).toBe('ready');
    expect(view!.files).toEqual([{ name: 'kitchen.pdf', kind: 'supplier_pdf' }]);
    const shown = view!.items.filter((i): i is ReviewCabinet => i.type === 'cabinet');
    expect(shown).toHaveLength(cabinets);
    for (const want of expected.cabinets) {
      const got = shown.find((c) => c.code === want.code);
      expect(got, want.code).toMatchObject({
        boxType: want.boxType,
        width: want.width,
        depth: want.depth,
        height: want.height,
        check: { plan: 'agrees', elevation: 'agrees' },
      });
      expect(got!.confidence).toBeGreaterThanOrEqual(view!.cutoff);
    }
  });

  it('a job of another company naming this company’s supplier PDF writes nothing', async () => {
    const tB = await createTenant();
    const [pB] = await createProjects(tB, 1);
    const jobId = await newJob(tB, pB, [file.id]);
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [file.id] },
      job: { id: jobId, tenant_id: tB, project_id: pB, kind: 'import' },
    });
    const { data, error } = await adminDb().from('import_session').select('id').eq('job_id', jobId);
    if (error) throw error;
    expect(data).toEqual([]);
  });
});
