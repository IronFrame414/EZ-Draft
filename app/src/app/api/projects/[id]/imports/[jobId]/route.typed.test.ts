// EZD-310 (S02 Typed or laser input): PATCH takes the typed value inside a wall or opening fix and refuses a typed
// value that is not a positive length. Mock pattern of route.patch.test.ts (EZD-309).
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
  // EZD-916: the import read no order report here.
  return {
    importReadsOrderReport: vi.fn(async () => false),
    readImportReview: vi.fn(),
    saveImportReview: vi.fn(),
    ReviewSaveError,
  };
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

describe('EZD-310 PATCH typed values', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes a typed wall and a typed opening fix through to the save', async () => {
    const typed = {
      mode: null,
      changes: [
        {
          item_id: 'w2',
          decision: 'accepted',
          fix: { geometry: { start: { x: 144, y: 120 }, end: { x: 144, y: -0.75 } }, typed: 120.75 },
        },
        { item_id: 'o1', decision: 'accepted', fix: { center: { x: 30, y: 0 }, width: 37, typed: 37 } },
      ],
    };
    permitted();
    vi.mocked(saveImportReview).mockResolvedValueOnce('saved');
    expect((await call(typed)).status).toBe(200);
    expect(saveImportReview).toHaveBeenCalledWith({}, P, J, typed);
  });

  it('refuses a typed value that is zero, negative, over 2400 in or not a number', async () => {
    for (const t of [0, -1, 2400.5, 'x']) {
      permitted();
      const bad = {
        changes: [
          {
            item_id: 'w2',
            decision: 'accepted',
            fix: { geometry: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, typed: t },
          },
        ],
      };
      expect((await call(bad)).status, String(t)).toBe(400);
    }
    expect(saveImportReview).not.toHaveBeenCalled();
  });
});
