// EZD-224 U3 (vault/plans/EZD-224.md section 4 "Route test mock pattern", U3; Decided "Route order (POST both)",
// "Complete body"; Seam). Same mocks as the start route test. Expected values: the plan's U3 row. The 401 is the
// bare `new Response(null, { status: 401 })`, so it carries no Cache-Control of its own.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../../server/permissions', () => ({
  requireApiPermission: vi.fn(),
  requirePermission: vi.fn(() => null),
}));
vi.mock('../../../../../../../../server/auth/supabase-server', () => ({
  createSessionClient: () => ({}),
}));
vi.mock('../../../../../../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
vi.mock('../../../../../../../../server/thumbnail/thumbnail', () => ({
  startCheckpointThumbnail: vi.fn(),
  completeCheckpointThumbnail: vi.fn(),
  projectThumbnailUrl: vi.fn(),
}));

import { reportRouteFailure } from '../../../../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../../../../server/permissions';
import { completeCheckpointThumbnail } from '../../../../../../../../server/thumbnail/thumbnail';
import { POST } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const NO_STORE = 'no-store';
const err = (code: string, key = `error.${code}`) => ({ error: { code, message_key: key } });
const forbidden = () =>
  Response.json(
    { error: { code: 'permission_denied', message_key: 'error.not_authorized' } },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
const permitted = () => ({ session: {}, ctx: {} }) as never;

const guard = vi.mocked(requireApiPermission);
const serverComplete = vi.mocked(completeCheckpointThumbnail);
const call = (id: string, versionId: string) =>
  POST(
    new Request(`http://localhost/api/projects/${id}/versions/${versionId}/thumbnail/complete`, {
      method: 'POST',
    }),
    { params: Promise.resolve({ id, versionId }) },
  );

describe('EZD-224 thumbnail complete route', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('EZD-224 U3 complete route answers 401, 403, 404, 409, 200 and 500 with no-store', async () => {
    guard.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await call(P, V)).status).toBe(401);

    guard.mockResolvedValueOnce(forbidden());
    const denied = await call(P, V);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual(err('permission_denied', 'error.not_authorized'));
    expect(serverComplete).not.toHaveBeenCalled();

    guard.mockResolvedValueOnce(permitted());
    const badId = await call('not-a-uuid', V);
    expect(badId.status).toBe(404);
    expect(await badId.json()).toEqual(err('project_not_found'));
    expect(badId.headers.get('Cache-Control')).toBe(NO_STORE);

    guard.mockResolvedValueOnce(permitted());
    const badVersion = await call(P, 'x');
    expect(badVersion.status).toBe(404);
    expect(await badVersion.json()).toEqual(err('version_not_found'));
    expect(badVersion.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(serverComplete).not.toHaveBeenCalled();

    guard.mockResolvedValueOnce(permitted());
    serverComplete.mockResolvedValueOnce({ ok: false, code: 'permission_denied' });
    const refused = await call(P, V);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual(err('permission_denied', 'error.not_authorized'));
    expect(refused.headers.get('Cache-Control')).toBe(NO_STORE);

    guard.mockResolvedValueOnce(permitted());
    serverComplete.mockResolvedValueOnce({ ok: false, code: 'version_not_found' });
    const notFound = await call(P, V);
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual(err('version_not_found'));
    expect(notFound.headers.get('Cache-Control')).toBe(NO_STORE);

    guard.mockResolvedValueOnce(permitted());
    serverComplete.mockResolvedValueOnce({ ok: false, code: 'thumbnail_invalid' });
    const invalid = await call(P, V);
    expect(invalid.status).toBe(409);
    expect(await invalid.json()).toEqual(err('thumbnail_invalid'));
    expect(invalid.headers.get('Cache-Control')).toBe(NO_STORE);

    guard.mockResolvedValueOnce(permitted());
    serverComplete.mockResolvedValueOnce({ ok: true, path: 't/p/thumb/v.webp' });
    const ok = await call(P, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      thumbnail: { versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    expect(ok.headers.get('Cache-Control')).toBe(NO_STORE);

    const boom = new Error('boom');
    guard.mockResolvedValueOnce(permitted());
    serverComplete.mockRejectedValueOnce(boom);
    const failed = await call(P, V);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual(err('db_unavailable'));
    expect(failed.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(reportRouteFailure).toHaveBeenCalledTimes(1);
    expect(reportRouteFailure).toHaveBeenCalledWith(
      boom,
      '/api/projects/[id]/versions/[versionId]/thumbnail/complete',
    );
  });
});
