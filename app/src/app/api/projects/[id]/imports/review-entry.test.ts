// EZD-307 (S02 Entry points "Continue to review"; Show 3D mesh "Only when a GLB was uploaded"): starting an import
// answers with the queued job's id, so the wizard opens Import review for it, and the job payload names the import's
// Polycam meshes. Mock pattern of EZD-302's import-job test.
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
  enqueueJob: vi.fn(async () => ({ id: '66666666-6666-4666-8666-666666666666' })),
}));

import { checkImportFiles } from '../../../../../server/imports/start-import';
import { enqueueJob } from '../../../../../server/jobs/enqueue';
import { requireApiPermission } from '../../../../../server/permissions';
import { POST } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const F1 = '22222222-2222-4222-8222-222222222222';
const F2 = '33333333-3333-4333-8333-333333333333';
const T = '44444444-4444-4444-8444-444444444444';
const J = '66666666-6666-4666-8666-666666666666';

const call = (body: unknown) =>
  POST(
    new Request(`http://localhost/api/projects/${P}/imports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: P }) },
  );
const permitted = () =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({
    session: { appUserId: T },
    ctx: {},
  } as never);

describe('EZD-307 starting an import opens review', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('answers the job id and names the GLB in the payload', async () => {
    permitted();
    vi.mocked(checkImportFiles).mockResolvedValueOnce({
      ok: true,
      tenantId: T,
      scanIds: [F1],
      meshIds: [F2],
    });
    const res = await call({ sourceFileIds: [F1, F2] });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ projectId: P, sourceFileIds: [F1, F2], jobId: J });
    expect(enqueueJob).toHaveBeenCalledWith(
      {},
      { kind: 'import', projectId: P, payload: { sourceFileIds: [F1], meshFileIds: [F2] } },
    );
  });

  it('answers jobId null when nothing was queued', async () => {
    permitted();
    vi.mocked(checkImportFiles).mockResolvedValueOnce({
      ok: true,
      tenantId: T,
      scanIds: [],
      meshIds: [F2],
    });
    const res = await call({ sourceFileIds: [F2] });
    expect(await res.json()).toEqual({ projectId: P, sourceFileIds: [F2], jobId: null });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
