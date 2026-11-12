// EZD-224 U4 (vault/plans/EZD-224.md section 4 "Route test mock pattern", U4; Decided "Route order (GET)"; S01
// Permissions). Same mocks as the start route test. Expected values: the plan's U4 row. The 401 is the bare
// `new Response(null, { status: 401 })`, so it carries no Cache-Control of its own.
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
vi.mock('../../../../../server/thumbnail/thumbnail', () => ({
  startCheckpointThumbnail: vi.fn(),
  completeCheckpointThumbnail: vi.fn(),
  projectThumbnailUrl: vi.fn(),
}));

import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { projectThumbnailUrl } from '../../../../../server/thumbnail/thumbnail';
import { GET } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const NO_STORE = 'no-store';
const err = (code: string, key = `error.${code}`) => ({ error: { code, message_key: key } });
const forbidden = () =>
  Response.json(
    { error: { code: 'permission_denied', message_key: 'error.not_authorized' } },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
const permitted = () => ({ session: {}, ctx: {} }) as never;

const guard = vi.mocked(requireApiPermission);
const serverUrl = vi.mocked(projectThumbnailUrl);
const call = (id: string) =>
  GET(new Request(`http://localhost/api/projects/${id}/thumbnail`), {
    params: Promise.resolve({ id }),
  });

describe('EZD-224 thumbnail GET route', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('EZD-224 U4 thumbnail GET answers 302 to the signed link, else 401, 403, 404 or 500', async () => {
    guard.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await call(P)).status).toBe(401);

    guard.mockResolvedValueOnce(forbidden());
    const denied = await call(P);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual(err('permission_denied', 'error.not_authorized'));

    guard.mockResolvedValueOnce(permitted());
    const badId = await call('not-a-uuid');
    expect(badId.status).toBe(404);
    expect(await badId.json()).toEqual(err('project_not_found'));
    expect(badId.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(serverUrl).not.toHaveBeenCalled();

    guard.mockResolvedValueOnce(permitted());
    serverUrl.mockResolvedValueOnce({ ok: true, url: 'https://x/s?token=t' });
    const ok = await call(P);
    expect(ok.status).toBe(302);
    expect(ok.headers.get('Location')).toBe('https://x/s?token=t');
    expect(ok.headers.get('Cache-Control')).toBe(NO_STORE);

    for (const code of ['thumbnail_not_found', 'project_not_found'] as const) {
      guard.mockResolvedValueOnce(permitted());
      serverUrl.mockResolvedValueOnce({ ok: false, code });
      const res = await call(P);
      expect(res.status, code).toBe(404);
      expect(await res.json()).toEqual(err(code));
      expect(res.headers.get('Cache-Control'), code).toBe(NO_STORE);
    }

    const boom = new Error('boom');
    guard.mockResolvedValueOnce(permitted());
    serverUrl.mockRejectedValueOnce(boom);
    const failed = await call(P);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual(err('db_unavailable'));
    expect(failed.headers.get('Cache-Control')).toBe(NO_STORE);
    expect(reportRouteFailure).toHaveBeenCalledWith(boom, '/api/projects/[id]/thumbnail');
  });
});
