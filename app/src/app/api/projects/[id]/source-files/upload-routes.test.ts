// EZD-301 (S01 Start from a file flow; Continue to review; Events emitted import.started): the Upload step's three
// routes. Mock pattern of EZD-224 U4 (the thumbnail route test). Expected: each route's documented order (401, 403
// without Edit model, 404 for a malformed id, 403 outside the scope, 400 for a bad body or the helper's input codes,
// 500 after reportRouteFailure), no-store on every answer, and import.started { projectId, sourceFileIds } emitted
// once with the project's tenant and the caller as actor.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../server/permissions', () => ({
  requireApiPermission: vi.fn(),
  requirePermission: vi.fn(() => null),
}));
vi.mock('../../../../../server/auth/supabase-server', () => ({
  createSessionClient: () => ({}),
}));
vi.mock('../../../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
vi.mock('../../../../../server/storage', async (orig) => ({
  ...(await orig<typeof import('../../../../../server/storage')>()),
  startSourceFileUpload: vi.fn(),
  completeSourceFileUpload: vi.fn(),
}));
vi.mock('../../../../../server/events', () => ({ emit: vi.fn(async () => ({})) }));
vi.mock('../../../../../server/imports/start-import', () => ({ checkImportFiles: vi.fn() }));

import { emit } from '../../../../../server/events';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { checkImportFiles } from '../../../../../server/imports/start-import';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import {
  completeSourceFileUpload,
  startSourceFileUpload,
  StorageError,
} from '../../../../../server/storage';
import { POST as complete } from '../../../source-files/[id]/complete/route';
import { POST as startImport } from '../imports/route';
import { POST as start } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const F1 = '22222222-2222-4222-8222-222222222222';
const F2 = '33333333-3333-4333-8333-333333333333';
const T = '44444444-4444-4444-8444-444444444444';
const U = '55555555-5555-4555-8555-555555555555';
const err = (code: string, key = `error.${code}`) => ({ error: { code, message_key: key } });
const forbidden = () =>
  Response.json(
    { error: { code: 'permission_denied', message_key: 'error.not_authorized' } },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
const permitted = () => ({ session: { appUserId: U }, ctx: {} }) as never;
const guard = vi.mocked(requireApiPermission);
const scope = vi.mocked(requirePermission);

const post = (path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const startBody = {
  kind: 'polycam_dxf',
  originalName: 'scan.dxf',
  contentType: 'image/vnd.dxf',
  size: 1500,
};
const callStart = (id: string, body: unknown = startBody) =>
  start(post(`/api/projects/${id}/source-files`, body), { params: Promise.resolve({ id }) });
const callComplete = (id: string) =>
  complete(post(`/api/source-files/${id}/complete`), { params: Promise.resolve({ id }) });
const callImport = (id: string, body: unknown) =>
  startImport(post(`/api/projects/${id}/imports`, body), { params: Promise.resolve({ id }) });

describe('EZD-301 upload step routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('EZD-301 R1 start: 201 with the row and signed upload, else 401, 403, 404, 400 or 500', async () => {
    guard.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await callStart(P)).status).toBe(401);
    guard.mockResolvedValueOnce(forbidden());
    expect((await callStart(P)).status).toBe(403);
    expect(guard).toHaveBeenLastCalledWith('edit_model');

    guard.mockResolvedValueOnce(permitted());
    const badId = await callStart('nope');
    expect(badId.status).toBe(404);
    expect(await badId.json()).toEqual(err('project_not_found'));

    guard.mockResolvedValueOnce(permitted());
    scope.mockReturnValueOnce(forbidden());
    expect((await callStart(P)).status).toBe(403);
    expect(scope).toHaveBeenLastCalledWith({}, 'edit_model', { projectId: P });

    guard.mockResolvedValueOnce(permitted());
    const bad = await callStart(P, { ...startBody, extra: 1 });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual(err('invalid_input'));
    expect(startSourceFileUpload).not.toHaveBeenCalled();

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(startSourceFileUpload).mockResolvedValueOnce({
      sourceFile: { id: F1 },
      upload: { url: 'u' },
    } as never);
    const ok = await callStart(P);
    expect(ok.status).toBe(201);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(await ok.json()).toEqual({ sourceFile: { id: F1 }, upload: { url: 'u' } });
    expect(startSourceFileUpload).toHaveBeenCalledWith(
      {},
      {
        ...startBody,
        projectId: P,
        uploadedBy: U,
      },
    );

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(startSourceFileUpload).mockRejectedValueOnce(new StorageError('permission_denied'));
    expect((await callStart(P)).status).toBe(403);

    for (const code of ['invalid_input', 'project_not_found', 'upload_refused'] as const) {
      guard.mockResolvedValueOnce(permitted());
      vi.mocked(startSourceFileUpload).mockRejectedValueOnce(new StorageError(code));
      const res = await callStart(P);
      expect(res.status, code).toBe(400);
      expect(await res.json()).toEqual(err(code, 'error.invalid_input'));
    }

    const boom = new Error('boom');
    guard.mockResolvedValueOnce(permitted());
    vi.mocked(startSourceFileUpload).mockRejectedValueOnce(boom);
    const failed = await callStart(P);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual(err('db_unavailable'));
    expect(reportRouteFailure).toHaveBeenCalledWith(boom, '/api/projects/[id]/source-files');
  });

  it('EZD-301 R2 complete: 200 with the row, else 401, 403, 404, 400 or 500', async () => {
    guard.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await callComplete(F1)).status).toBe(401);
    guard.mockResolvedValueOnce(forbidden());
    expect((await callComplete(F1)).status).toBe(403);
    guard.mockResolvedValueOnce(permitted());
    expect((await callComplete('nope')).status).toBe(404);

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(completeSourceFileUpload).mockResolvedValueOnce({ id: F1 } as never);
    const ok = await callComplete(F1);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ sourceFile: { id: F1 } });
    expect(completeSourceFileUpload).toHaveBeenCalledWith({}, F1);

    for (const code of [
      'upload_missing',
      'upload_size_mismatch',
      'source_file_not_found',
    ] as const) {
      guard.mockResolvedValueOnce(permitted());
      vi.mocked(completeSourceFileUpload).mockRejectedValueOnce(new StorageError(code));
      const res = await callComplete(F1);
      expect(res.status, code).toBe(400);
      expect(await res.json()).toEqual(err(code, 'error.invalid_input'));
    }

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(completeSourceFileUpload).mockRejectedValueOnce(new Error('x'));
    expect((await callComplete(F1)).status).toBe(500);
  });

  it('EZD-301 R3 import: 202 and import.started, else 401, 403, 404, 400 or 500', async () => {
    const body = { sourceFileIds: [F1, F2] };
    guard.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await callImport(P, body)).status).toBe(401);
    guard.mockResolvedValueOnce(forbidden());
    expect((await callImport(P, body)).status).toBe(403);
    guard.mockResolvedValueOnce(permitted());
    expect((await callImport('nope', body)).status).toBe(404);
    guard.mockResolvedValueOnce(permitted());
    scope.mockReturnValueOnce(forbidden());
    expect((await callImport(P, body)).status).toBe(403);

    for (const bad of [
      { sourceFileIds: [] },
      { sourceFileIds: ['x'] },
      { sourceFileIds: [F1, F1] },
      { sourceFileIds: Array.from({ length: 21 }, () => crypto.randomUUID()) },
      {},
    ]) {
      guard.mockResolvedValueOnce(permitted());
      const res = await callImport(P, bad);
      expect(res.status, JSON.stringify(bad).slice(0, 40)).toBe(400);
    }
    expect(checkImportFiles).not.toHaveBeenCalled();

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(checkImportFiles).mockResolvedValueOnce({ ok: false, code: 'project_not_found' });
    expect((await callImport(P, body)).status).toBe(404);
    for (const code of ['source_file_not_found', 'upload_missing'] as const) {
      guard.mockResolvedValueOnce(permitted());
      vi.mocked(checkImportFiles).mockResolvedValueOnce({ ok: false, code });
      const res = await callImport(P, body);
      expect(res.status, code).toBe(400);
      expect(await res.json()).toEqual(err(code, 'error.invalid_input'));
    }
    expect(emit).not.toHaveBeenCalled();

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(checkImportFiles).mockResolvedValueOnce({ ok: true, tenantId: T });
    const ok = await callImport(P, body);
    expect(ok.status).toBe(202);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(await ok.json()).toEqual({ projectId: P, sourceFileIds: [F1, F2] });
    expect(checkImportFiles).toHaveBeenLastCalledWith({}, P, [F1, F2]);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      'import.started',
      { projectId: P, sourceFileIds: [F1, F2] },
      { tenantId: T, projectId: P, actorId: U },
    );

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(checkImportFiles).mockRejectedValueOnce(new Error('x'));
    expect((await callImport(P, body)).status).toBe(500);
    expect(reportRouteFailure).toHaveBeenCalledWith(
      expect.any(Error),
      '/api/projects/[id]/imports',
    );
  });
});
