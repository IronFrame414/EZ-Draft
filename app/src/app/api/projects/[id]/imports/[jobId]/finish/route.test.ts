// EZD-313 (S02 Permissions "Edit model: required for ... Finish import"; Controls Finish import; Events emitted
// import.completed, model.saved on Finish import, room.closure_overridden): POST finish's order of answers and its
// events. Mock pattern of ../route.patch.test.ts; the write itself is tested on the local stack in
// server/imports/finish-import.db.test.ts.
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
vi.mock('../../../../../../../server/errors/report', () => ({
  reportError: vi.fn(async () => {}),
}));
vi.mock('../../../../../../../server/events', () => ({ emit: vi.fn(async () => ({})) }));
vi.mock('../../../../../../../server/imports/finish-import', () => {
  class ImportCloseError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return { finishImport: vi.fn(), ImportCloseError };
});

import { reportError } from '../../../../../../../server/errors/report';
import { emit } from '../../../../../../../server/events';
import { finishImport, ImportCloseError } from '../../../../../../../server/imports/finish-import';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';
import { POST } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const T = '33333333-3333-4333-8333-333333333333';
const U = '44444444-4444-4444-8444-444444444444';
const V = '55555555-5555-4555-8555-555555555555';
const ROOM = '66666666-6666-4666-8666-666666666666';

const call = (id = P, jobId = J) =>
  POST(
    new Request(`http://localhost/api/projects/${id}/imports/${jobId}/finish`, { method: 'POST' }),
    {
      params: Promise.resolve({ id, jobId }),
    },
  );
const permitted = () =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({
    session: { appUserId: U },
    ctx: {},
  } as never);

const FINISHED = {
  status: 'finished' as const,
  tenantId: T,
  modelVersionId: V,
  objectIds: ['a', ROOM],
  sourceFileIds: ['f1'],
  counts: { accepted: 2, deleted: 1 },
  imported: { walls: 1, windows: 0, doors: 0, rooms: 1 },
  overridden: [{ roomId: ROOM, gapIn: 2 }],
};

describe('EZD-313 POST /api/projects/[id]/imports/[jobId]/finish', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers 401 or 403 from the Edit model check first, then 404 for a malformed id', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await call()).status).toBe(401);
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await call()).status).toBe(403);
    expect(requireApiPermission).toHaveBeenCalledWith('edit_model');
    permitted();
    vi.mocked(requirePermission).mockReturnValueOnce(new Response(null, { status: 403 }) as never);
    expect((await call()).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith({}, 'edit_model', { projectId: P });
    permitted();
    expect((await call('nope')).status).toBe(404);
    expect(finishImport).not.toHaveBeenCalled();
  });

  it('maps each refusal to its answer and emits nothing', async () => {
    const cases: [unknown, number, string][] = [
      [{ status: 'not_found' }, 404, 'import_not_found'],
      [{ status: 'not_ready' }, 409, 'import_not_ready'],
      [{ status: 'unresolved' }, 409, 'import_unresolved'],
      [{ status: 'locked' }, 409, 'lock_held'],
      [{ status: 'closed' }, 409, 'import_closed'],
      [{ status: 'invalid' }, 400, 'invalid_input'],
    ];
    for (const [result, status, code] of cases) {
      permitted();
      vi.mocked(finishImport).mockResolvedValueOnce(result as never);
      const res = await call();
      expect(res.status, code).toBe(status);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
    }
    for (const [code, status] of [
      ['permission_denied', 403],
      ['not_found', 404],
      ['invalid_input', 400],
    ] as const) {
      permitted();
      vi.mocked(finishImport).mockRejectedValueOnce(new ImportCloseError(code as never));
      expect((await call()).status, code).toBe(status);
    }
    expect(emit).not.toHaveBeenCalled();
  });

  it('answers 200 with the version and counts, then emits import.completed, model.saved and room.closure_overridden', async () => {
    permitted();
    vi.mocked(finishImport).mockResolvedValueOnce(FINISHED);
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'finished',
      modelVersionId: V,
      counts: { accepted: 2, deleted: 1 },
      imported: { walls: 1, windows: 0, doors: 0, rooms: 1 },
    });
    expect(finishImport).toHaveBeenCalledWith({}, P, J, U);
    const ctx = { tenantId: T, projectId: P, actorId: U };
    expect(vi.mocked(emit).mock.calls).toEqual([
      [
        'import.completed',
        {
          projectId: P,
          sourceFileIds: ['f1'],
          counts: { accepted: 2, deleted: 1 },
          modelVersionId: V,
        },
        ctx,
      ],
      ['model.saved', { objectIds: ['a', ROOM] }, ctx],
      ['room.closure_overridden', { roomId: ROOM, gapIn: 2, userId: U }, ctx],
    ]);
  });

  it('a failed emit is reported and the Finish still answers 200', async () => {
    permitted();
    vi.mocked(finishImport).mockResolvedValueOnce(FINISHED);
    vi.mocked(emit).mockRejectedValueOnce(new Error('sink down'));
    expect((await call()).status).toBe(200);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(3);
  });
});
