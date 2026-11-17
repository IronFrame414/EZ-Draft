// EZD-307 (S02 Permissions "View projects: view the review in read-only"): the review read's order of answers,
// as GET /api/jobs/[id] (401, 403, 404, 200). Mock pattern of EZD-302's import-job test; the reads themselves are
// tested on the local stack in server/imports/review.db.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../server/permissions', () => ({
  requireApiPermission: vi.fn(),
  requirePermission: vi.fn(() => null),
}));
vi.mock('../../../../../../server/auth/supabase-server', () => ({
  createSessionClient: () => ({}),
}));
vi.mock('../../../../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
vi.mock('../../../../../../server/imports/review', () => ({ readImportReview: vi.fn() }));

import { readImportReview } from '../../../../../../server/imports/review';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';
import { GET } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const NOT_FOUND = { error: { code: 'import_not_found', message_key: 'error.import_not_found' } };

const call = (id = P, jobId = J) =>
  GET(new Request(`http://localhost/api/projects/${id}/imports/${jobId}`), {
    params: Promise.resolve({ id, jobId }),
  });
const permitted = () =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({ session: {}, ctx: {} } as never);

describe('EZD-307 GET /api/projects/[id]/imports/[jobId]', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers 401 or 403 from the View projects check first', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await call()).status).toBe(401);
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await call()).status).toBe(403);
    expect(requireApiPermission).toHaveBeenCalledWith('view_projects');
    expect(readImportReview).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed id and 403 for a project outside the member’s list', async () => {
    permitted();
    const bad = await call('nope');
    expect(bad.status).toBe(404);
    expect(await bad.json()).toEqual(NOT_FOUND);
    permitted();
    expect((await call(P, 'nope')).status).toBe(404);
    permitted();
    vi.mocked(requirePermission).mockReturnValueOnce(new Response(null, { status: 403 }) as never);
    expect((await call()).status).toBe(403);
    expect(readImportReview).not.toHaveBeenCalled();
  });

  it('answers 404 for an import it cannot read, 200 with the review otherwise', async () => {
    permitted();
    vi.mocked(readImportReview).mockResolvedValueOnce(null);
    const missing = await call();
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual(NOT_FOUND);
    permitted();
    const review = { jobId: J, projectId: P, status: 'detecting' };
    vi.mocked(readImportReview).mockResolvedValueOnce(review as never);
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(await ok.json()).toEqual({ review });
    expect(readImportReview).toHaveBeenLastCalledWith({}, P, J);
  });
});
