// EZD-901a on the local stack (phase-09 EZD-901a "adds the 150,000-entity DXF to the benchmark project"; 11 Budgets
// "a 150,000-entity reference DXF"): making the benchmark project through ensureBenchmarkProject, as the route does,
// uploads the stand-in DXF as the caller's own source_file (kind dxf, upload completed, the stored bytes are the
// generator's) and queues one reference_convert job for it; a second call adds neither. The 16 MB conversion
// itself is not run here (reference-convert.db.test.ts runs the job on the fixture); benchmark-dxf.test.ts counts
// the file.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { ensureBenchmarkProject } from '../benchmark/benchmark-project';
import { BENCHMARK_DXF_NAME, generateBenchmarkDxf } from './benchmark-dxf';

const FULL = ['view_projects', 'edit_model', 'settings_system_status'];

describe('EZD-901a benchmark reference DXF', () => {
  let release: () => Promise<void>;
  let tenant = '';
  const storagePaths: string[] = [];

  beforeAll(async () => {
    release = await holdJobQueueShared();
  });

  afterAll(async () => {
    try {
      if (tenant) await adminDb().from('job').delete().eq('tenant_id', tenant);
      if (storagePaths.length > 0) await adminDb().storage.from('sources').remove(storagePaths);
      await cleanup();
    } finally {
      await release?.();
      await closeHarness();
    }
  });

  it('the new benchmark project gets the 150,000-entity DXF and one conversion job, once', { timeout: 120_000 }, async () => {
    tenant = await createTenant();
    const owner = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, owner.membershipId, FULL as never);
    const s = await signIn(owner.email);
    const first = await ensureBenchmarkProject(s.serverDb, { appUserId: owner.appUserId, kick: () => {} });
    expect(first).toMatchObject({ ok: true, created: true });
    if (!first.ok) return;

    const { data: files, error } = await adminDb()
      .from('source_file')
      .select('id, tenant_id, kind, original_name, content_type, size_bytes, uploaded_by, uploaded_at, storage_path')
      .eq('project_id', first.projectId);
    expect(error).toBeNull();
    expect(files).toHaveLength(1);
    const file = files![0]!;
    storagePaths.push(file.storage_path);
    const text = generateBenchmarkDxf();
    expect(file).toMatchObject({
      tenant_id: tenant,
      kind: 'dxf',
      original_name: BENCHMARK_DXF_NAME,
      content_type: 'image/vnd.dxf',
      size_bytes: text.length,
      uploaded_by: owner.appUserId,
    });
    expect(file.uploaded_at).not.toBeNull();
    const { data: stored } = await adminDb().storage.from('sources').download(file.storage_path);
    expect(await stored!.text()).toBe(text);

    const { data: jobs } = await adminDb()
      .from('job')
      .select('kind, payload, status')
      .eq('project_id', first.projectId);
    expect(jobs).toEqual([{ kind: 'reference_convert', payload: { sourceFileId: file.id }, status: 'queued' }]);

    const second = await ensureBenchmarkProject(s.serverDb, { appUserId: owner.appUserId, kick: () => {} });
    expect(second).toEqual({ ok: true, projectId: first.projectId, created: false });
    const { count } = await adminDb()
      .from('source_file')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', first.projectId);
    expect(count).toBe(1);
    const { count: jobCount } = await adminDb()
      .from('job')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', first.projectId);
    expect(jobCount).toBe(1);
  });
});
