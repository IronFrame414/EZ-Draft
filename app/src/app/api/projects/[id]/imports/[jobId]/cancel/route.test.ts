// EZD-313 (S02 Controls Cancel import; Events emitted import.cancelled; AC-EZD-313-1): POST cancel's order of answers
// and its event. Mock pattern of ../route.patch.test.ts; the write itself is tested on the local stack in
// server/imports/cancel-import.db.test.ts.
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
vi.mock('../../../../../../../server/imports/cancel-import', () => ({ cancelImport: vi.fn() }));
vi.mock('../../../../../../../server/imports/finish-import', () => {
  class ImportCloseError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return { ImportCloseError };
});

import { reportError } from '../../../../../../../server/errors/report';
import { emit } from '../../../../../../../server/events';
import { cancelImport } from '../../../../../../../server/imports/cancel-import';
import { ImportCloseError } from '../../../../../../../server/imports/finish-import';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';
import { POST } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const T = '33333333-3333-4333-8333-333333333333';
const U = '44444444-4444-4444-8444-444444444444';

const call = (id = P, jobId = J) =>
  POST(
    new Request(`http://localhost/api/projects/${id}/imports/${jobId}/cancel`, { method: 'POST' }),
    {
      params: Promise.resolve({ id, jobId }),
    },
  );
const permitted = () =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({
    session: { appUserId: U },
    ctx: {},
  } as never);

describe('EZD-313 POST /api/projects/[id]/imports/[jobId]/cancel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers 401 or 403 from the Edit model check first, then 404 for a malformed id', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await call()).status).toBe(401);
    expect(requireApiPermission).toHaveBeenCalledWith('edit_model');
    permitted();
    vi.mocked(requirePermission).mockReturnValueOnce(new Response(null, { status: 403 }) as never);
    expect((await call()).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith({}, 'edit_model', { projectId: P });
    permitted();
    expect((await call(P, 'nope')).status).toBe(404);
    expect(cancelImport).not.toHaveBeenCalled();
  });

  it('answers 409 locked or closed and the RPC refusals, emitting nothing', async () => {
    permitted();
    vi.mocked(cancelImport).mockResolvedValueOnce({ status: 'locked' });
    expect((await call()).status).toBe(409);
    permitted();
    vi.mocked(cancelImport).mockResolvedValueOnce({ status: 'closed' });
    const closed = await call();
    expect(closed.status).toBe(409);
    expect(((await closed.json()) as { error: { code: string } }).error.code).toBe('import_closed');
    permitted();
    vi.mocked(cancelImport).mockRejectedValueOnce(new ImportCloseError('not_found' as never));
    expect((await call()).status).toBe(404);
    permitted();
    vi.mocked(cancelImport).mockRejectedValueOnce(
      new ImportCloseError('permission_denied' as never),
    );
    expect((await call()).status).toBe(403);
    expect(emit).not.toHaveBeenCalled();
  });

  it('answers 200 and emits import.cancelled; a failed emit is reported only', async () => {
    permitted();
    vi.mocked(cancelImport).mockResolvedValueOnce({ status: 'cancelled', tenantId: T });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'cancelled' });
    expect(vi.mocked(emit).mock.calls).toEqual([
      ['import.cancelled', { projectId: P, jobId: J }, { tenantId: T, projectId: P, actorId: U }],
    ]);
    permitted();
    vi.mocked(cancelImport).mockResolvedValueOnce({ status: 'cancelled', tenantId: T });
    vi.mocked(emit).mockRejectedValueOnce(new Error('sink down'));
    expect((await call()).status).toBe(200);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
