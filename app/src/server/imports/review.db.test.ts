// EZD-307 on the local stack (AC-EZD-307-1 "Review opens when detection finishes and shows the counts"; S02 Data
// shown; Show 3D mesh "Only when a GLB was uploaded"; CLAUDE.md rule 4). The import's job and session rows are
// written with the secret key as the import job writes them (EZD-302); the items are hand-written (four walls,
// one door, one window, one room: fixtures/synthetic/room-12x10.dxf.expected.json `semantic`). Expected: detecting
// while the job is queued (S02 States Loading); ready with the items and a mesh link once the job is done; failed
// with the file name for a failed session (S02 States Error); another company sees nothing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
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
import type { SourceFileKind } from '../../lib/storage/source-file-kinds';
import {
  completeSourceFileUpload,
  startSourceFileUpload,
  type DbClient,
  type SourceFileView,
} from '../storage';
import { readImportReview } from './review';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const DXF = path.join(repo, 'fixtures/synthetic/room-12x10.dxf');
const GLB = path.join(repo, 'fixtures/synthetic/room-12x10-sloped.glb');
const db = (s: Session) => s.serverDb as unknown as DbClient;

const wall = (n: number, side: string, sx: number, sy: number, ex: number, ey: number) => ({
  id: `w${n}`,
  type: 'wall',
  number: n,
  side,
  confidence: 95,
  geometry: { start: { x: sx, y: sy }, end: { x: ex, y: ey } },
  thickness: 4.5,
  thicknessSide: 'right',
  joinedEnds: 2,
  layer: 'WALLS',
});
const ITEMS = [
  wall(1, 'south', 144, 0, 0, 0),
  wall(2, 'east', 144, 120, 144, 0),
  wall(3, 'north', 0, 120, 144, 120),
  wall(4, 'west', 0, 0, 0, 120),
  {
    id: 'o1',
    type: 'opening',
    kind: 'door',
    number: 1,
    confidence: 90,
    hostWallId: 'w1',
    offset: 12,
    width: 36,
    center: { x: 30, y: 0 },
    hinge: { x: 12, y: 0 },
    layer: 'DOORS',
  },
  {
    id: 'o2',
    type: 'opening',
    kind: 'window',
    number: 1,
    confidence: 90,
    hostWallId: 'w1',
    offset: 84,
    width: 36,
    center: { x: 102, y: 0 },
    hinge: null,
    layer: 'WINDOWS',
  },
  {
    id: 'r1',
    type: 'room',
    number: 1,
    confidence: 90,
    boundary: [
      { x: 0, y: 0 },
      { x: 144, y: 0 },
      { x: 144, y: 120 },
      { x: 0, y: 120 },
    ],
    closed: true,
    areaSqIn: 17280,
    layer: 'ROOMS',
  },
];

describe('EZD-307 import review read', () => {
  const paths: string[] = [];
  let release: (() => Promise<void>) | undefined;
  let tA = '';
  let pA = '';
  let a: Member;
  let sA: Session;
  let sB: Session;
  let dxf: SourceFileView;
  let glb: SourceFileView;

  async function send(kind: SourceFileKind, contentType: string, name: string, file: string) {
    const bytes = new Uint8Array(readFileSync(file));
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

  async function job(status: 'queued' | 'done', payload: object): Promise<string> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tA,
        project_id: pA,
        kind: 'import',
        payload,
        status,
        max_attempts: 3,
        // Never due, so no runner in another test file claims it.
        run_after: '2099-01-01T00:00:00Z',
        created_by: a.appUserId,
        ...(status === 'done' ? { finished_at: new Date().toISOString() } : {}),
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  async function session(jobId: string, status: 'ready' | 'failed', items: unknown[]) {
    const { error } = await adminDb()
      .from('import_session')
      .insert({
        tenant_id: tA,
        project_id: pA,
        source_file_id: dxf.id,
        job_id: jobId,
        source_kind: 'scan',
        status,
        items,
        summary: {},
        error: status === 'failed' ? 'binary_dxf' : null,
      });
    if (error) throw error;
  }

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    sA = await signIn(a.email);
    const tB = await createTenant();
    const b = await createMember({ tenantId: tB, scope: 'all' });
    sB = await signIn(b.email);
    dxf = await send('polycam_dxf', 'image/vnd.dxf', 'family-room.dxf', DXF);
    glb = await send('polycam_glb', 'model/gltf-binary', 'mesh.glb', GLB);
  }, 180_000);

  afterAll(async () => {
    try {
      if (tA) await adminDb().from('job').delete().eq('tenant_id', tA);
      if (paths.length > 0) await adminDb().storage.from('sources').remove(paths);
      await cleanup();
    } finally {
      await release?.();
      await closeHarness();
    }
  });

  it('is detecting while the job is queued', async () => {
    const id = await job('queued', { sourceFileIds: [dxf.id], meshFileIds: [glb.id] });
    const view = await readImportReview(db(sA), pA, id);
    expect(view?.status).toBe('detecting');
    expect(view?.items).toEqual([]);
    expect(view?.files).toEqual([
      { name: 'family-room.dxf', kind: 'polycam_dxf' },
      { name: 'mesh.glb', kind: 'polycam_glb' },
    ]);
  });

  it('AC-EZD-307-1: is ready with every detected item and a mesh link once detection finishes', async () => {
    const id = await job('done', { sourceFileIds: [dxf.id], meshFileIds: [glb.id] });
    await session(id, 'ready', ITEMS);
    const view = await readImportReview(db(sA), pA, id);
    expect(view?.status).toBe('ready');
    expect(view?.items).toHaveLength(7);
    expect(view?.items.filter((i) => i.type === 'wall')).toHaveLength(4);
    expect(view?.items.filter((i) => i.type === 'opening')).toHaveLength(2);
    expect(view?.items.filter((i) => i.type === 'room')).toHaveLength(1);
    expect(view?.meshUrl).toEqual(expect.stringContaining('/storage/v1/object/sign/sources/'));
    // The link serves the original GLB bytes.
    const res = await fetch(view?.meshUrl as string);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer()).length).toBe(readFileSync(GLB).length);
  });

  it('offers no mesh when the import has no GLB', async () => {
    const id = await job('done', { sourceFileIds: [dxf.id] });
    await session(id, 'ready', ITEMS);
    const view = await readImportReview(db(sA), pA, id);
    expect(view?.status).toBe('ready');
    expect(view?.meshUrl).toBeNull();
  });

  it('is failed with the file name when detection failed', async () => {
    const id = await job('done', { sourceFileIds: [dxf.id] });
    await session(id, 'failed', []);
    const view = await readImportReview(db(sA), pA, id);
    expect(view?.status).toBe('failed');
    expect(view?.failedFile).toBe('family-room.dxf');
  });

  it('another company cannot read the import', async () => {
    const id = await job('done', { sourceFileIds: [dxf.id], meshFileIds: [glb.id] });
    await session(id, 'ready', ITEMS);
    expect(await readImportReview(db(sB), pA, id)).toBeNull();
    // Nor a mesh link to the GLB.
    const { error } = await db(sB).storage.from('sources').createSignedUrl(glb.storagePath, 60);
    expect(error).not.toBeNull();
  });
});
