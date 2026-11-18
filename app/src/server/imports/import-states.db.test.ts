// EZD-314 on the local stack (S02 States Loading "progress with item count so far"; S01 States "Import in progress:
// card shows Importing"; AC-EZD-314-1, -5; CLAUDE.md rule 4). While an import job runs, the review counts the items
// of the files already read (each file is one import_session written as it is read): one file of 2 items read, one
// still to read, gives 2. list_projects marks a project importing while its import job is queued or running or a
// session is detecting or in review, and not once the import is finished, cancelled or failed. Another company
// sees neither the count nor the flag (the project is not listed, the import is not found).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
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
import type { Database } from '../db/database.types';
import { listProjects } from '../projects/projects';
import { startSourceFileUpload, type DbClient } from '../storage';
import { readImportReview } from './review';

const db = (s: Session) => s.serverDb as unknown as DbClient;
const typed = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

const wall = (n: number) => ({
  id: `w${n}`,
  type: 'wall',
  number: n,
  side: 'south',
  confidence: 95,
  geometry: { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
  thickness: 4.5,
});

describe('EZD-314 import states on the server', () => {
  let release: (() => Promise<void>) | undefined;
  let tA = '';
  let pA = '';
  let a: Member;
  let sA: Session;
  let sB: Session;
  const files: string[] = [];

  async function job(status: 'queued' | 'running' | 'done' | 'failed'): Promise<string> {
    const running = status === 'running';
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tA,
        project_id: pA,
        kind: 'import',
        payload: { sourceFileIds: files },
        status,
        attempts: running ? 1 : 0,
        max_attempts: 3,
        run_after: '2099-01-01T00:00:00Z',
        run_id: running ? crypto.randomUUID() : null,
        lease_expires_at: running ? '2099-01-01T00:00:00Z' : null,
        created_by: a.appUserId,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }
  async function session(jobId: string, file: string, status: string, items: unknown[]) {
    const s = await adminDb()
      .from('import_session')
      .insert({
        tenant_id: tA,
        project_id: pA,
        source_file_id: file,
        job_id: jobId,
        source_kind: 'scan',
        status,
        items: items as never,
        summary: {},
      });
    if (s.error) throw s.error;
  }
  const importingOf = async (s: Session) => {
    const page = await listProjects(typed(s), { tab: 'all', sort: 'edited', after: null });
    return page.items.find((i) => i.id === pA)?.importing;
  };
  const clear = async () => {
    await adminDb().from('import_session').delete().eq('project_id', pA);
    await adminDb().from('job').delete().eq('project_id', pA);
  };

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, a.membershipId, ['view_projects', 'edit_model']);
    sA = await signIn(a.email);
    const tB = await createTenant();
    const b = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tB, b.membershipId, ['view_projects', 'edit_model']);
    sB = await signIn(b.email);
    for (const name of ['kitchen.dxf', 'bath.dxf']) {
      const { sourceFile } = await startSourceFileUpload(db(sA), {
        projectId: pA,
        kind: 'polycam_dxf',
        originalName: name,
        contentType: 'image/vnd.dxf',
        size: 10,
        uploadedBy: a.appUserId,
      });
      files.push(sourceFile.id);
    }
  }, 180_000);

  afterAll(async () => {
    try {
      if (tA) {
        await adminDb().from('import_session').delete().eq('tenant_id', tA);
        await adminDb().from('job').delete().eq('tenant_id', tA);
      }
      await cleanup();
    } finally {
      await release?.();
      await closeHarness();
    }
  });

  it('AC-EZD-314-1: a running import counts the items of the files read so far', async () => {
    const j = await job('running');
    expect((await readImportReview(db(sA), pA, j))?.detectedCount).toBe(0);
    await session(j, files[0], 'ready', [wall(1), wall(2)]);
    const read = await readImportReview(db(sA), pA, j);
    expect(read?.status).toBe('detecting');
    expect(read?.detectedCount).toBe(2);
    expect(read?.items).toEqual([]);
    expect(await readImportReview(db(sB), pA, j)).toBeNull();
    await clear();
  });

  it('AC-EZD-314-5: list_projects marks the project importing while an import is in progress', async () => {
    expect(await importingOf(sA)).toBe(false);

    const queued = await job('queued');
    expect(await importingOf(sA)).toBe(true);
    await clear();

    const running = await job('running');
    expect(await importingOf(sA)).toBe(true);
    await clear();

    // Detection done, review open (ready): still in progress until Finish or Cancel.
    const inReview = await job('done');
    await session(inReview, files[0], 'ready', [wall(1)]);
    expect(await importingOf(sA)).toBe(true);
    await harnessSql()`update public.import_session set status = 'finished' where job_id = ${inReview}::uuid`;
    expect(await importingOf(sA)).toBe(false);
    await clear();

    // A session whose job is gone (job_id set null) has no review to finish: not importing.
    const orphaned = await job('done');
    await session(orphaned, files[0], 'ready', [wall(1)]);
    expect(await importingOf(sA)).toBe(true);
    await adminDb().from('job').delete().eq('id', orphaned);
    expect(await importingOf(sA)).toBe(false);
    await clear();

    const cancelled = await job('done');
    await session(cancelled, files[0], 'cancelled', []);
    expect(await importingOf(sA)).toBe(false);
    await clear();

    const failed = await job('failed');
    expect(await importingOf(sA)).toBe(false);
    await clear();

    void [queued, running, failed];
  });

  it('another company does not see the project, importing or not', async () => {
    await job('running');
    const page = await listProjects(typed(sB), { tab: 'all', sort: 'edited', after: null });
    expect(page.items.map((i) => i.id)).not.toContain(pA);
    await clear();
  });
});
