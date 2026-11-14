// EZD-302 (phase-03 EZD-302 "runs as a background job"): starting an import queues one import job for the Polycam
// floor plan DXFs among the files, after import.started, and none when there is no DXF scan (a GLB alone is
// EZD-303's). Mock pattern of EZD-301's upload-routes test.
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
vi.mock('../../../../../server/events', () => ({ emit: vi.fn(async () => ({})) }));
vi.mock('../../../../../server/imports/start-import', () => ({ checkImportFiles: vi.fn() }));
vi.mock('../../../../../server/jobs/enqueue', () => ({
  enqueueJob: vi.fn(async () => ({ id: 'j' })),
}));

import { emit } from '../../../../../server/events';
import { checkImportFiles } from '../../../../../server/imports/start-import';
import { enqueueJob } from '../../../../../server/jobs/enqueue';
import { requireApiPermission } from '../../../../../server/permissions';
import { POST } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const F1 = '22222222-2222-4222-8222-222222222222';
const F2 = '33333333-3333-4333-8333-333333333333';
const T = '44444444-4444-4444-8444-444444444444';
const U = '55555555-5555-4555-8555-555555555555';

const call = (body: unknown) =>
  POST(
    new Request(`http://localhost/api/projects/${P}/imports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: P }) },
  );

describe('EZD-302 import route queues detection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queues one import job for the DXF scans, after import.started', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce({
      session: { appUserId: U },
      ctx: {},
    } as never);
    vi.mocked(checkImportFiles).mockResolvedValueOnce({ ok: true, tenantId: T, scanIds: [F1] });
    const res = await call({ sourceFileIds: [F1, F2] });
    expect(res.status).toBe(202);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob).toHaveBeenCalledWith(
      {},
      {
        kind: 'import',
        projectId: P,
        payload: { sourceFileIds: [F1] },
      },
    );
    expect(vi.mocked(emit).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(enqueueJob).mock.invocationCallOrder[0],
    );
  });

  it('queues nothing when no file is a Polycam floor plan DXF', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce({
      session: { appUserId: U },
      ctx: {},
    } as never);
    vi.mocked(checkImportFiles).mockResolvedValueOnce({ ok: true, tenantId: T, scanIds: [] });
    expect((await call({ sourceFileIds: [F2] })).status).toBe(202);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
