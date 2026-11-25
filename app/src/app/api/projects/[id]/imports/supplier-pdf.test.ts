// EZD-915 (S12 Supplier PDF import "result goes to Import review"; Q-0323 "EZD-132 keeps See company costs on supplier
// files"): starting an import from a supplier PDF queues it for detection with the other drawings, and needs See
// company costs as well as Edit model (403 before import.started). Mock pattern of EZD-302's import-job test.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../server/permissions', () => ({
  requireApiPermission: vi.fn(),
  requirePermission: vi.fn((ctx: { denied?: string[] }, key: string) =>
    ctx.denied?.includes(key) ? Response.json({ error: { code: 'permission_denied' } }, { status: 403 }) : null,
  ),
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

const signedIn = (denied: string[] = []) =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({
    session: { appUserId: U },
    ctx: { denied },
  } as never);

describe('EZD-915 import route takes supplier PDFs', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queues the supplier PDF for detection', async () => {
    signedIn();
    vi.mocked(checkImportFiles).mockResolvedValueOnce({
      ok: true,
      tenantId: T,
      scanIds: [F1],
      supplierPdfIds: [F2],
    });
    const res = await call({ sourceFileIds: [F1, F2] });
    expect(res.status).toBe(202);
    expect(enqueueJob).toHaveBeenCalledWith(
      {},
      { kind: 'import', projectId: P, payload: { sourceFileIds: [F1, F2] } },
    );
    expect((await res.json()).jobId).toBe('j');
  });

  it('without See company costs a supplier PDF is refused (403) and nothing starts', async () => {
    signedIn(['see_company_costs']);
    vi.mocked(checkImportFiles).mockResolvedValueOnce({
      ok: true,
      tenantId: T,
      scanIds: [],
      supplierPdfIds: [F2],
    });
    const res = await call({ sourceFileIds: [F2] });
    expect(res.status).toBe(403);
    expect(emit).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('without See company costs an import with no supplier PDF still starts', async () => {
    signedIn(['see_company_costs']);
    vi.mocked(checkImportFiles).mockResolvedValueOnce({ ok: true, tenantId: T, scanIds: [F1] });
    expect((await call({ sourceFileIds: [F1] })).status).toBe(202);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });
});
