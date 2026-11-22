// EZD-914 (S12 Permissions "View: View projects. Upload: Upload references"; Upload; Q-0323 supplier files are cost
// files; EZD-322): the Supplier files panel's routes. Mock pattern of EZD-301's upload-routes test. Expected: each
// route's documented order (401, 403 without the route's switch, 404 for a malformed id, 403 outside the scope, 400 for
// a bad body or the helper's input codes, 403 without See company costs, 500 after reportRouteFailure) and no-store.
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
vi.mock('../../../../../server/storage/source-files', async (orig) => ({
  ...(await orig<typeof import('../../../../../server/storage/source-files')>()),
  startSourceFileUpload: vi.fn(),
  completeSourceFileUpload: vi.fn(),
  listSupplierFiles: vi.fn(),
}));

import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import {
  completeSourceFileUpload,
  listSupplierFiles,
  startSourceFileUpload,
} from '../../../../../server/storage/source-files';
import { StorageError } from '../../../../../server/storage';
import { POST as complete } from '../../../supplier-files/[id]/complete/route';
import { GET as list, POST as start } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const F1 = '22222222-2222-4222-8222-222222222222';
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

const req = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const startBody = {
  kind: 'order_report',
  originalName: '2020_order_report.pdf',
  contentType: 'application/pdf',
  size: 1500,
  supplierName: 'Cabinet Co',
  supplierContactEmail: 'orders@cabinet.example',
};
const callStart = (id: string, body: unknown = startBody) =>
  start(req(`/api/projects/${id}/supplier-files`, 'POST', body), { params: Promise.resolve({ id }) });
const callList = (id: string) =>
  list(req(`/api/projects/${id}/supplier-files`, 'GET'), { params: Promise.resolve({ id }) });
const callComplete = (id: string) =>
  complete(req(`/api/supplier-files/${id}/complete`, 'POST'), { params: Promise.resolve({ id }) });

describe('EZD-914 supplier files routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('EZD-914 R1 list: 200 with the files under View projects; 403 without See company costs', async () => {
    guard.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await callList(P)).status).toBe(401);
    guard.mockResolvedValueOnce(forbidden());
    expect((await callList(P)).status).toBe(403);
    expect(guard).toHaveBeenLastCalledWith('view_projects');

    guard.mockResolvedValueOnce(permitted());
    expect((await callList('nope')).status).toBe(404);

    guard.mockResolvedValueOnce(permitted());
    scope.mockReturnValueOnce(forbidden());
    expect((await callList(P)).status).toBe(403);
    expect(scope).toHaveBeenLastCalledWith({}, 'view_projects', { projectId: P });

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(listSupplierFiles).mockRejectedValueOnce(new StorageError('permission_denied'));
    const denied = await callList(P);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual(err('permission_denied', 'error.not_authorized'));

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(listSupplierFiles).mockResolvedValueOnce([{ id: F1 }] as never);
    const ok = await callList(P);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(await ok.json()).toEqual({ files: [{ id: F1 }] });
    expect(listSupplierFiles).toHaveBeenLastCalledWith({}, U, P);

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(listSupplierFiles).mockRejectedValueOnce(new Error('boom'));
    expect((await callList(P)).status).toBe(500);
    expect(reportRouteFailure).toHaveBeenCalledTimes(1);
  });

  it('EZD-914 R2 start: Upload references, a supplier name and a supplier kind; 201 with the row', async () => {
    guard.mockResolvedValueOnce(forbidden());
    expect((await callStart(P)).status).toBe(403);
    expect(guard).toHaveBeenLastCalledWith('upload_references');

    guard.mockResolvedValueOnce(permitted());
    scope.mockReturnValueOnce(forbidden());
    expect((await callStart(P)).status).toBe(403);
    expect(scope).toHaveBeenLastCalledWith({}, 'upload_references', { projectId: P });

    for (const bad of [
      { ...startBody, supplierName: '  ' },
      { ...startBody, kind: 'polycam_dxf' },
      { ...startBody, extra: 1 },
    ]) {
      guard.mockResolvedValueOnce(permitted());
      const res = await callStart(P, bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(err('invalid_input'));
    }
    expect(startSourceFileUpload).not.toHaveBeenCalled();

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(startSourceFileUpload).mockRejectedValueOnce(new StorageError('permission_denied'));
    expect((await callStart(P)).status).toBe(403);

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(startSourceFileUpload).mockResolvedValueOnce({
      sourceFile: { id: F1 },
      upload: { url: 'u' },
    } as never);
    const ok = await callStart(P, { ...startBody, supplierContactEmail: '' });
    expect(ok.status).toBe(201);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(startSourceFileUpload).toHaveBeenLastCalledWith(
      {},
      { ...startBody, supplierContactEmail: null, projectId: P, uploadedBy: U },
    );
  });

  it('EZD-914 R3 complete: Upload references; 200 with the stamped row, 400 for the helper codes', async () => {
    guard.mockResolvedValueOnce(forbidden());
    expect((await callComplete(F1)).status).toBe(403);
    expect(guard).toHaveBeenLastCalledWith('upload_references');

    guard.mockResolvedValueOnce(permitted());
    expect((await callComplete('nope')).status).toBe(404);

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(completeSourceFileUpload).mockRejectedValueOnce(new StorageError('upload_missing'));
    expect((await callComplete(F1)).status).toBe(400);

    guard.mockResolvedValueOnce(permitted());
    vi.mocked(completeSourceFileUpload).mockResolvedValueOnce({ id: F1 } as never);
    const ok = await callComplete(F1);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ sourceFile: { id: F1 } });
  });
});
