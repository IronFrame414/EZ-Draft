// EZD-306 (S01 DXF: conversion choice "After upload, DXF only"; layer checklist): the layers route. Mock pattern of
// EZD-301's upload-routes test. Expected: the documented order (401, 403 without Edit model, 404 for a malformed
// id, 403 outside the scope, 404 for a hidden file, 400 for a file that is not an uploaded DXF drawing, 400 with the
// reader's code for a binary DXF, 500 after reportRouteFailure), no-store on every answer, and the synthetic room's
// entity layers (fixtures/synthetic/room-12x10.dxf.expected.json `entitiesByLayer`), sorted.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../server/permissions', () => ({
  requireApiPermission: vi.fn(),
  requirePermission: vi.fn(() => null),
}));
vi.mock('../../../../../../../server/auth/supabase-server', () => ({
  createSessionClient: () => ({}),
}));
vi.mock('../../../../../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
vi.mock('../../../../../../../server/storage', async (orig) => ({
  ...(await orig<typeof import('../../../../../../../server/storage')>()),
  readObject: vi.fn(),
}));
vi.mock('../../../../../../../server/storage/source-files', () => ({
  readReviewSourceFiles: vi.fn(),
}));

import { reportRouteFailure } from '../../../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';
import { readObject } from '../../../../../../../server/storage';
import { readReviewSourceFiles } from '../../../../../../../server/storage/source-files';
import { GET } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const F = '22222222-2222-4222-8222-222222222222';
const U = '55555555-5555-4555-8555-555555555555';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ...Array(9).fill('..'));
const CLEAN = path.join(repo, 'fixtures/synthetic/room-12x10.dxf');
const expected = JSON.parse(readFileSync(`${CLEAN}.expected.json`, 'utf8'));

const call = (id = P, fileId = F) =>
  GET(new Request(`http://localhost/api/projects/${id}/source-files/${fileId}/layers`), {
    params: Promise.resolve({ id, fileId }),
  });
const permitted = () => ({ session: { appUserId: U }, ctx: {} }) as never;
const file = (kind: string, uploaded = true) =>
  new Map([[F, { name: 'a.dxf', kind, storagePath: `t/${P}/${F}`, uploaded }]]);
const codeOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('EZD-306 DXF layers route', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers the drawing’s layers, sorted, with no-store', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(permitted());
    vi.mocked(readReviewSourceFiles).mockResolvedValueOnce(file('dxf'));
    vi.mocked(readObject).mockResolvedValueOnce(new Uint8Array(readFileSync(CLEAN)));
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ layers: Object.keys(expected.entitiesByLayer).sort() });
    expect(readReviewSourceFiles).toHaveBeenCalledWith({}, P, [F]);
  });

  it('401 and 403 come from the permission guard', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(
      Response.json({ error: { code: 'unauthenticated' } }, { status: 401 }) as never,
    );
    expect((await call()).status).toBe(401);
    vi.mocked(requireApiPermission).mockResolvedValueOnce(permitted());
    vi.mocked(requirePermission).mockReturnValueOnce(
      Response.json({ error: { code: 'permission_denied' } }, { status: 403 }) as never,
    );
    expect((await call()).status).toBe(403);
    expect(readReviewSourceFiles).not.toHaveBeenCalled();
  });

  it('a malformed id is 404', async () => {
    vi.mocked(requireApiPermission).mockResolvedValue(permitted());
    expect((await call('nope')).status).toBe(404);
    expect((await call(P, 'nope')).status).toBe(404);
    expect(readReviewSourceFiles).not.toHaveBeenCalled();
  });

  it('a hidden file is 404; a Polycam DXF or an unfinished upload is 400', async () => {
    vi.mocked(requireApiPermission).mockResolvedValue(permitted());
    vi.mocked(readReviewSourceFiles).mockResolvedValueOnce(new Map());
    expect(await codeOf(await call())).toBe('source_file_not_found');
    vi.mocked(readReviewSourceFiles).mockResolvedValueOnce(file('polycam_dxf'));
    const polycam = await call();
    expect(polycam.status).toBe(400);
    vi.mocked(readReviewSourceFiles).mockResolvedValueOnce(file('dxf', false));
    expect((await call()).status).toBe(400);
    expect(readObject).not.toHaveBeenCalled();
  });

  it('a binary DXF is 400 binary_dxf', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(permitted());
    vi.mocked(readReviewSourceFiles).mockResolvedValueOnce(file('dxf'));
    vi.mocked(readObject).mockResolvedValueOnce(new TextEncoder().encode('AutoCAD Binary DXF\r\n'));
    const res = await call();
    expect(res.status).toBe(400);
    expect(await codeOf(res)).toBe('binary_dxf');
  });

  it('any other failure is 500 after reportRouteFailure', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(permitted());
    vi.mocked(readReviewSourceFiles).mockRejectedValueOnce(new Error('down'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(reportRouteFailure).toHaveBeenCalledTimes(1);
  });
});
