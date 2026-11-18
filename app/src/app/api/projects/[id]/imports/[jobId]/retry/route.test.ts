// EZD-314 (S02 States "Error: import job failed: message with file name and Retry"; AC-EZD-314-2): POST retry's
// order of answers, and the runner started only when the import went back on the queue. Mock pattern of
// ../cancel/route.test.ts; the write itself is tested on the local stack in
// server/imports/retry-import.db.test.ts.
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
vi.mock('../../../../../../../server/jobs/kick', () => ({ kickJobRunner: vi.fn() }));
vi.mock('../../../../../../../server/imports/review', () => {
  class ReviewSaveError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return { ReviewSaveError, retryImport: vi.fn() };
});

import { reportRouteFailure } from '../../../../../../../server/errors/route-failure';
import { ReviewSaveError, retryImport } from '../../../../../../../server/imports/review';
import { kickJobRunner } from '../../../../../../../server/jobs/kick';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';
import { POST } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';

const call = (id = P, jobId = J) =>
  POST(
    new Request(`http://localhost/api/projects/${id}/imports/${jobId}/retry`, { method: 'POST' }),
    {
      params: Promise.resolve({ id, jobId }),
    },
  );
const permitted = () =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({
    session: { appUserId: 'u' },
    ctx: {},
  } as never);
const body = async (r: Response) => ({ status: r.status, json: await r.json() });
const err = (code: string, key: string) => ({ error: { code, message_key: key } });

describe('EZD-314 POST /api/projects/[id]/imports/[jobId]/retry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers 401 or 403 from the Edit model check first', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await call()).status).toBe(401);
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await call()).status).toBe(403);
    expect(requireApiPermission).toHaveBeenCalledWith('edit_model');
    expect(retryImport).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed id and 403 for a project outside the member’s list', async () => {
    permitted();
    expect(await body(await call('nope'))).toEqual({
      status: 404,
      json: err('import_not_found', 'error.import_not_found'),
    });
    permitted();
    vi.mocked(requirePermission).mockReturnValueOnce(new Response(null, { status: 403 }) as never);
    expect((await call()).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith({}, 'edit_model', { projectId: P });
    expect(retryImport).not.toHaveBeenCalled();
  });

  it('AC-EZD-314-2: answers 200 and starts the runner when the import went back on the queue', async () => {
    permitted();
    vi.mocked(retryImport).mockResolvedValueOnce('queued');
    expect(await body(await call())).toEqual({ status: 200, json: { status: 'queued' } });
    expect(retryImport).toHaveBeenCalledWith({}, P, J);
    expect(kickJobRunner).toHaveBeenCalledTimes(1);
  });

  it('answers 409 for a held lock, a closed import and one that has not failed, without the runner', async () => {
    const cases = [
      ['locked', err('lock_held', 'error.lock_held')],
      ['closed', err('import_closed', 'error.import_closed')],
      ['busy', err('import_not_failed', 'error.import_not_failed')],
      ['not_failed', err('import_not_failed', 'error.import_not_failed')],
    ] as const;
    for (const [answer, json] of cases) {
      permitted();
      vi.mocked(retryImport).mockResolvedValueOnce(answer);
      expect(await body(await call())).toEqual({ status: 409, json });
    }
    expect(kickJobRunner).not.toHaveBeenCalled();
  });

  it('answers 404 not found and 403 refused from retry_import, 500 for anything else', async () => {
    permitted();
    vi.mocked(retryImport).mockRejectedValueOnce(new ReviewSaveError('not_found'));
    expect(await body(await call())).toEqual({
      status: 404,
      json: err('import_not_found', 'error.import_not_found'),
    });
    permitted();
    vi.mocked(retryImport).mockRejectedValueOnce(new ReviewSaveError('permission_denied'));
    expect(await body(await call())).toEqual({
      status: 403,
      json: err('permission_denied', 'error.not_authorized'),
    });
    permitted();
    vi.mocked(retryImport).mockRejectedValueOnce(new Error('boom'));
    expect(await body(await call())).toEqual({
      status: 500,
      json: err('db_unavailable', 'error.db_unavailable'),
    });
    expect(reportRouteFailure).toHaveBeenCalledTimes(1);
    expect(kickJobRunner).not.toHaveBeenCalled();
  });
});
