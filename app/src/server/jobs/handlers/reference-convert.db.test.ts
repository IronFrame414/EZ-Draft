// EZD-901a on the local stack (phase-09 EZD-901a; AC-EZD-901a-1; 03c reference_drawing; CLAUDE.md rule 4): the
// reference_convert job reads the uploaded fixture architect DXF from the sources bucket, stores one buffer per
// layer and a manifest in the jobs bucket under the job's output folder, and writes the reference_drawing row with
// the layer state and the not-read counts. Expected values: fixtures/synthetic/architect-plan.dxf.expected.json
// (entitiesByLayer, notRead), counted from the generator's declarations. A binary DXF gives a failed reference with
// its code (S11 States Error "Unreadable file"). One company cannot read or change another's references, and a job
// of company B that names A's file writes nothing.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../../test-harness/jobs/queue-lock';
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
import {
  completeSourceFileUpload,
  startSourceFileUpload,
  type DbClient,
  type SourceFileView,
} from '../../storage';
import { getHandlers } from '../handlers';
import { decodeLayerBuffer } from '../reference-dxf/format';
import type { ReferenceManifest } from '../reference-dxf/convert';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FIXTURE = path.join(repo, 'fixtures/synthetic/architect-plan.dxf');
const expected = JSON.parse(readFileSync(`${FIXTURE}.expected.json`, 'utf8')) as {
  entitiesByLayer: Record<string, number>;
  notRead: Record<string, number>;
  layers: Array<{ name: string }>;
};
const db = (s: Session) => s.serverDb as unknown as DbClient;

describe('EZD-901a reference conversion job', () => {
  const sourcePaths: string[] = [];
  const jobIds: string[] = [];
  let release: () => Promise<void>;
  let tA = '';
  let pA = '';
  let a: Member;
  let sA: Session;
  let drawing: SourceFileView;
  let broken: SourceFileView;

  async function send(name: string, bytes: Uint8Array<ArrayBuffer>): Promise<SourceFileView> {
    const { sourceFile, upload } = await startSourceFileUpload(db(sA), {
      projectId: pA,
      kind: 'dxf',
      originalName: name,
      contentType: 'image/vnd.dxf',
      size: bytes.length,
      uploadedBy: a.appUserId,
    });
    sourcePaths.push(sourceFile.storagePath);
    await uploadFile(upload, new Blob([bytes]), { contentType: 'image/vnd.dxf' });
    return completeSourceFileUpload(db(sA), sourceFile.id);
  }

  // A finished job row the handler runs against (status done, so no runner in another test file claims it).
  async function newJob(tenantId: string, projectId: string, sourceFileId: string): Promise<string> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tenantId,
        project_id: projectId,
        kind: 'reference_convert',
        payload: { sourceFileId },
        status: 'done',
        max_attempts: 3,
      })
      .select('id')
      .single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    jobIds.push(id);
    return id;
  }

  const jobFields = (id: string, tenantId = tA, projectId = pA) => ({
    id,
    tenant_id: tenantId,
    project_id: projectId,
    kind: 'reference_convert' as const,
  });

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    sA = await signIn(a.email);
    drawing = await send('architect-plan.dxf', new Uint8Array(readFileSync(FIXTURE)));
    broken = await send('broken.dxf', new TextEncoder().encode('AutoCAD Binary DXF\r\n'));
  }, 60000);

  afterAll(async () => {
    try {
      if (sourcePaths.length > 0) await adminDb().storage.from('sources').remove(sourcePaths);
      for (const id of jobIds) {
        const prefix = `${tA}/${pA}/${id}/out/reference`;
        const { data } = await adminDb().storage.from('jobs').list(prefix, { limit: 1000 });
        const names = (data ?? []).map((o) => `${prefix}/${o.name}`);
        if (names.length > 0) await adminDb().storage.from('jobs').remove(names);
      }
      if (jobIds.length > 0) await adminDb().from('job').delete().in('id', jobIds);
      await cleanup();
    } finally {
      await release?.();
      await closeHarness();
    }
  });

  it('AC-EZD-901a-1 converts the fixture once per layer: stored buffer counts equal the parser counts', async () => {
    const jobId = await newJob(tA, pA, drawing.id);
    await expectSafeToRunTwice('reference_convert', {
      payload: { sourceFileId: drawing.id },
      job: jobFields(jobId),
    });

    const { data: row, error } = await adminDb()
      .from('reference_drawing')
      .select('tenant_id, project_id, source_file_id, job_id, version_no, status, error, units, layer_state, not_read, manifest_path')
      .eq('source_file_id', drawing.id)
      .single();
    expect(error).toBeNull();
    const dir = `${tA}/${pA}/${jobId}/out/reference`;
    expect(row).toMatchObject({
      tenant_id: tA,
      project_id: pA,
      job_id: jobId,
      version_no: 1,
      status: 'ready',
      error: null,
      units: 'inches',
      not_read: expected.notRead,
      manifest_path: `${dir}/manifest.json`,
    });
    const state = row!.layer_state as Array<{ name: string; count: number; converted: boolean }>;
    expect(state.map((l) => l.name)).toEqual(expected.layers.map((l) => l.name));
    expect(
      Object.fromEntries(state.filter((l) => l.count > 0).map((l) => [l.name, l.count])),
    ).toEqual(expected.entitiesByLayer);
    expect(state.every((l) => l.converted === false)).toBe(true);

    // The stored buffers themselves: each layer's decoded entity table has the declared count.
    const { data: manifestBlob } = await adminDb().storage.from('jobs').download(`${dir}/manifest.json`);
    const manifest = JSON.parse(await manifestBlob!.text()) as ReferenceManifest;
    const counts: Record<string, number> = {};
    for (const layer of manifest.layers) {
      for (const f of layer.files) {
        const { data: blob } = await adminDb().storage.from('jobs').download(`${dir}/${f.file}`);
        const n = decodeLayerBuffer(new Uint8Array(await blob!.arrayBuffer())).entities.length;
        counts[layer.name] = (counts[layer.name] ?? 0) + n;
      }
    }
    expect(counts).toEqual(expected.entitiesByLayer);
    expect(manifest.notRead).toEqual({ LEADER: 1 });
  });

  it('a binary DXF gives a failed reference with its code', async () => {
    const jobId = await newJob(tA, pA, broken.id);
    await expectSafeToRunTwice('reference_convert', {
      payload: { sourceFileId: broken.id },
      job: jobFields(jobId),
    });
    const { data } = await adminDb()
      .from('reference_drawing')
      .select('status, error, manifest_path, layer_state')
      .eq('source_file_id', broken.id)
      .single();
    expect(data).toEqual({ status: 'failed', error: 'binary_dxf', manifest_path: null, layer_state: [] });
  });

  it("a member reads their company's references and cannot write them", async () => {
    const { data, error } = await sA.serverDb.from('reference_drawing').select('id, tenant_id');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(new Set(data!.map((r) => r.tenant_id))).toEqual(new Set([tA]));
    // No write policy: an update changes no row and an insert is refused by RLS.
    const write = await sA.serverDb
      .from('reference_drawing')
      .update({ rev_label: 'C' })
      .eq('tenant_id', tA)
      .select('id');
    expect(write.error).toBeNull();
    expect(write.data).toEqual([]);
    const insert = await sA.serverDb.from('reference_drawing').insert({
      tenant_id: tA,
      project_id: pA,
      source_file_id: drawing.id,
      status: 'failed',
      error: 'unreadable_dxf',
    });
    expect(insert.error?.code).toBe('42501');
  });

  it('a manifest path outside the reference’s own project is refused by the table', async () => {
    const [other] = await createProjects(tA, 1);
    const { error } = await adminDb()
      .from('reference_drawing')
      .update({ manifest_path: `${tA}/${other}/x/out/reference/manifest.json` })
      .eq('source_file_id', drawing.id);
    expect(error?.code).toBe('23514');
  });

  it('a job of company B that names A’s file is refused and writes nothing', async () => {
    const tB = await createTenant();
    const [pB] = await createProjects(tB, 1);
    const jobId = await newJob(tB, pB, drawing.id);
    const handler = getHandlers().reference_convert!;
    await expect(
      handler.run({
        job: { ...jobFields(jobId, tB, pB), attempts: 1 } as never,
        payload: { sourceFileId: drawing.id },
        state: null,
        progress: async () => {},
        timeLeft: () => Number.MAX_SAFE_INTEGER,
        sleep: async () => {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'source_file_not_found', retry: false });
    const { data } = await adminDb().from('reference_drawing').select('id').eq('job_id', jobId);
    expect(data).toEqual([]);
  });

  describeTenantIsolation('reference_drawing', {
    makeRow: async (t, ctx) => {
      const id = randomUUID();
      const project = ctx.projectIds[0];
      const { error } = await adminDb()
        .from('source_file')
        .insert({
          id,
          tenant_id: t,
          project_id: project,
          kind: 'dxf',
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
        status: 'ready',
        manifest_path: `${t}/${project}/${id}/out/reference/manifest.json`,
      };
    },
    update: { rev_label: 'B' },
  });
});
