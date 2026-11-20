// EZD-309 (S02 Permissions "Edit model: required for every accept, fix, delete"; phase-03 EZD-309 per-item review
// changes): PATCH's order of answers. Mock pattern of route.test.ts; the save itself is tested on the local stack in
// server/imports/review-save.db.test.ts.
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
vi.mock('../../../../../../server/imports/review', () => {
  class ReviewSaveError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return { readImportReview: vi.fn(), saveImportReview: vi.fn(), ReviewSaveError };
});

import { ReviewSaveError, saveImportReview } from '../../../../../../server/imports/review';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';
import { PATCH } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const BODY = {
  mode: 'by_room',
  changes: [
    {
      item_id: 'w3',
      decision: 'accepted',
      fix: { geometry: { start: { x: 0, y: 120 }, end: { x: 144, y: 118 } } },
    },
    { item_id: 'o1', decision: 'rejected', fix: null },
    { item_id: 'w1', decision: null, fix: null },
  ],
};

const call = (body: unknown = BODY, id = P, jobId = J) =>
  PATCH(
    new Request(`http://localhost/api/projects/${id}/imports/${jobId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id, jobId }) },
  );
const permitted = () =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({ session: {}, ctx: {} } as never);

describe('EZD-309 PATCH /api/projects/[id]/imports/[jobId]', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers 401 or 403 from the Edit model check first', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await call()).status).toBe(401);
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await call()).status).toBe(403);
    expect(requireApiPermission).toHaveBeenCalledWith('edit_model');
    permitted();
    vi.mocked(requirePermission).mockReturnValueOnce(new Response(null, { status: 403 }) as never);
    expect((await call()).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith({}, 'edit_model', { projectId: P });
    expect(saveImportReview).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed id and 400 for a body outside the rules', async () => {
    permitted();
    expect((await call(BODY, 'nope')).status).toBe(404);
    for (const bad of [
      'not json',
      { changes: [] },
      { mode: 'sideways', changes: [] },
      { changes: [{ item_id: 'w1', decision: 'maybe', fix: null }] },
      { changes: [{ item_id: 'w1', decision: null, fix: { geometry: { start: { x: 0 } } } }] },
      {
        changes: [
          { item_id: 'w1', decision: 'accepted', fix: null },
          { item_id: 'w1', decision: 'rejected', fix: null },
        ],
      },
    ]) {
      permitted();
      const res = await call(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: 'invalid_input', message_key: 'error.invalid_input' },
      });
    }
    expect(saveImportReview).not.toHaveBeenCalled();
  });

  it('saves the batch and answers 200', async () => {
    permitted();
    vi.mocked(saveImportReview).mockResolvedValueOnce('saved');
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'saved' });
    expect(saveImportReview).toHaveBeenCalledWith({}, P, J, BODY);
  });

  it('answers 409 when locked or closed, and the save function’s refusals as 403, 404, 400', async () => {
    permitted();
    vi.mocked(saveImportReview).mockResolvedValueOnce('locked');
    const locked = await call();
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({
      error: { code: 'lock_held', message_key: 'error.lock_held' },
    });
    permitted();
    vi.mocked(saveImportReview).mockResolvedValueOnce('closed');
    expect(await (await call()).json()).toEqual({
      error: { code: 'import_closed', message_key: 'error.import_closed' },
    });
    const refusals: Array<[string, number]> = [
      ['permission_denied', 403],
      ['not_found', 404],
      ['invalid_input', 400],
    ];
    for (const [code, status] of refusals) {
      permitted();
      vi.mocked(saveImportReview).mockRejectedValueOnce(new ReviewSaveError(code as never));
      expect((await call()).status).toBe(status);
    }
    permitted();
    vi.mocked(saveImportReview).mockRejectedValueOnce(new Error('boom'));
    expect((await call()).status).toBe(500);
  });
});
