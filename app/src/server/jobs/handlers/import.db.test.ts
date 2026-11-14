// EZD-302 on the local stack (phase-03 EZD-302 "write import_session items; runs as a background job and emits
// import.ready"; 03c import_session; CLAUDE.md rule 4). Expected values: the synthetic room's 4 walls, 1 door,
// 1 window and 1 room (fixtures/synthetic/room-12x10.dxf.expected.json `semantic`, `roomPolygon`); source_kind
// `scan` for a Polycam scan (03c); a GLB is not this job's (EZD-303); a file the parser cannot read gives a failed
// session with a stable code (S02 States Error). One company cannot read or change another's sessions.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectSafeToRunTwice } from '../../../../test-harness/jobs/run-twice';
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
import { uploadFile } from '../../../lib/storage/upload';
import type { SourceFileKind } from '../../../lib/storage/source-file-kinds';
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

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
);
const CLEAN = path.join(repo, 'fixtures/synthetic/room-12x10.dxf');
const expected = JSON.parse(readFileSync(`${CLEAN}.expected.json`, 'utf8'));
const db = (s: Session) => s.serverDb as unknown as DbClient;

describe('EZD-302 import job', () => {
  const paths: string[] = [];
  let tA = '';
  let pA = '';
  let a: Member;
  let sA: Session;
  let dxf: SourceFileView;
  let glb: SourceFileView;
  let broken: SourceFileView;

  async function send(
    kind: SourceFileKind,
    contentType: string,
    name: string,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<SourceFileView> {
    const { sourceFile, upload } = await startSourceFileUpload(db(sA), {
      projectId: pA,
      kind,
      originalName: name,
      contentType,
      size: bytes.length,
      uploadedBy: a.appUserId,
    });
    paths.push(sourceFile.storagePath);
    await uploadFile(upload, new Blob([bytes]), { contentType });
    return completeSourceFileUpload(db(sA), sourceFile.id);
  }

  async function newJob(sourceFileIds: string[]): Promise<string> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tA,
        project_id: pA,
        kind: 'import',
        payload: { sourceFileIds },
        max_attempts: 3,
        created_by: a.appUserId,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  const jobFields = (id: string) => ({
    id,
    tenant_id: tA,
    project_id: pA,
    kind: 'import' as const,
    created_by: a.appUserId,
  });

  beforeAll(async () => {
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    sA = await signIn(a.email);
    dxf = await send(
      'polycam_dxf',
      'image/vnd.dxf',
      'scan.dxf',
      new Uint8Array(readFileSync(CLEAN)),
    );
    glb = await send('polycam_glb', 'model/gltf-binary', 'scan.glb', new Uint8Array([1, 2, 3, 4]));
    broken = await send(
      'polycam_dxf',
      'image/vnd.dxf',
      'broken.dxf',
      new TextEncoder().encode('AutoCAD Binary DXF\r\n'),
    );
  }, 60000);

  afterAll(async () => {
    try {
      if (paths.length > 0) await adminDb().storage.from('sources').remove(paths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('detects the scan into one import_session, safe to run twice, and emits import.ready once', async () => {
    const jobId = await newJob([dxf.id, glb.id]);
    emitted.length = 0;
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [dxf.id, glb.id] },
      job: jobFields(jobId),
    });

    const { data: rows, error } = await adminDb()
      .from('import_session')
      .select(
        'id, tenant_id, project_id, source_file_id, job_id, source_kind, mode, status, items, summary, error',
      )
      .eq('job_id', jobId);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    const row = rows![0] as Record<string, unknown> & {
      items: Array<{ type: string; confidence: number }>;
    };
    expect(row).toMatchObject({
      tenant_id: tA,
      project_id: pA,
      source_file_id: dxf.id,
      source_kind: 'scan',
      mode: 'accept_fix',
      status: 'ready',
      error: null,
      summary: { walls: expected.semantic.walls.length, openings: 2, rooms: 1 },
    });
    const types = row.items.map((i) => i.type);
    expect(types.filter((t) => t === 'wall')).toHaveLength(expected.semantic.walls.length);
    expect(types.filter((t) => t === 'opening')).toHaveLength(2);
    expect(types.filter((t) => t === 'room')).toHaveLength(1);
    for (const item of row.items) expect(typeof item.confidence).toBe('number');

    const ready = emitted.filter((e) => e.name === 'import.ready');
    expect(ready).toEqual([
      {
        name: 'import.ready',
        payload: {
          projectId: pA,
          importSessionIds: [row.id],
          counts: { walls: 4, openings: 2, rooms: 1 },
        },
      },
    ]);
  });

  it('a file the parser cannot read gives a failed session with its code', async () => {
    const jobId = await newJob([broken.id]);
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [broken.id] },
      job: jobFields(jobId),
    });
    const { data } = await adminDb()
      .from('import_session')
      .select('status, error, items')
      .eq('job_id', jobId)
      .single();
    expect(data).toEqual({ status: 'failed', error: 'binary_dxf', items: [] });
  });

  it("a member reads their company's sessions and cannot write them", async () => {
    const { data, error } = await sA.serverDb.from('import_session').select('id, tenant_id');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((r) => r.tenant_id))).toEqual(new Set([tA]));
    // No write policy: an update changes no row and an insert is refused by RLS.
    const write = await sA.serverDb
      .from('import_session')
      .update({ status: 'finished' })
      .eq('tenant_id', tA)
      .select('id');
    expect(write.error).toBeNull();
    expect(write.data).toEqual([]);
    const insert = await sA.serverDb.from('import_session').insert({
      tenant_id: tA,
      project_id: pA,
      source_file_id: dxf.id,
      source_kind: 'scan',
    });
    expect(insert.error?.code).toBe('42501');
  });

  it('another company cannot see the job’s files: a job of company B names A’s file and writes nothing', async () => {
    const tB = await createTenant();
    const [pB] = await createProjects(tB, 1);
    const { data: job } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tB,
        project_id: pB,
        kind: 'import',
        payload: { sourceFileIds: [dxf.id] },
        max_attempts: 1,
      })
      .select('id')
      .single();
    const jobId = (job as { id: string }).id;
    await expectSafeToRunTwice('import', {
      payload: { sourceFileIds: [dxf.id] },
      job: { id: jobId, tenant_id: tB, project_id: pB, kind: 'import' },
    });
    const { data } = await adminDb().from('import_session').select('id').eq('job_id', jobId);
    expect(data).toEqual([]);
  });

  describeTenantIsolation('import_session', {
    makeRow: async (t, ctx) => {
      const id = randomUUID();
      const project = ctx.projectIds[0];
      const { error } = await adminDb()
        .from('source_file')
        .insert({
          id,
          tenant_id: t,
          project_id: project,
          kind: 'polycam_dxf',
          storage_path: `${t}/${project}/${id}`,
          original_name: 'iso.dxf',
          content_type: 'image/vnd.dxf',
          size_bytes: 1,
        });
      if (error) throw error;
      return {
        tenant_id: t,
        project_id: project,
        source_file_id: id,
        source_kind: 'scan',
        status: 'ready',
      };
    },
    update: { status: 'cancelled' },
  });
});
