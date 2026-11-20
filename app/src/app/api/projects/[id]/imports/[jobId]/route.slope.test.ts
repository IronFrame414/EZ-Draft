// EZD-312 (S02 Decisions "heights at points (low/high wall), pitch, or the value read from the mesh"; AC-EZD-312-1):
// PATCH takes a ceiling slope fix set by each of the three inputs and refuses one outside the rules. Mock pattern of
// route.typed.test.ts (EZD-310).
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

import { saveImportReview } from '../../../../../../server/imports/review';
import { requireApiPermission } from '../../../../../../server/permissions';
import { PATCH } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const call = (body: unknown, id = P, jobId = J) =>
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

describe('EZD-312 PATCH ceiling slope fixes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes a slope fixed by heights, by pitch and from the mesh through to the save', async () => {
    for (const input of ['points', 'pitch', 'mesh']) {
      const body = {
        mode: null,
        changes: [
          {
            item_id: 's1',
            decision: 'accepted',
            fix: { input, lowHeight: 96, highHeight: 144, pitchPer12: 4 },
          },
        ],
      };
      permitted();
      vi.mocked(saveImportReview).mockResolvedValueOnce('saved');
      expect((await call(body)).status, input).toBe(200);
      expect(saveImportReview).toHaveBeenLastCalledWith({}, P, J, body);
    }
  });

  it('refuses an unknown input, a zero height, a pitch over 24/12 and an extra key', async () => {
    const bad = [
      { input: 'guess', lowHeight: 96, highHeight: 144, pitchPer12: 4 },
      { input: 'points', lowHeight: 0, highHeight: 144, pitchPer12: 4 },
      { input: 'pitch', lowHeight: 96, highHeight: 144, pitchPer12: 25 },
      { input: 'mesh', lowHeight: 96, highHeight: 144, pitchPer12: 4, run: 144 },
    ];
    for (const fix of bad) {
      permitted();
      const res = await call({ changes: [{ item_id: 's1', decision: 'accepted', fix }] });
      expect(res.status, JSON.stringify(fix)).toBe(400);
    }
    expect(saveImportReview).not.toHaveBeenCalled();
  });
});
