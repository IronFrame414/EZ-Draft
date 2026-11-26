// EZD-916 (Q-0323 "EZD-132 keeps See company costs on supplier files and order reports"): Import review of an import
// that read an order report shows the report's own lines, so a member with View projects and Edit model but without
// See company costs gets 403 permission_denied on both the read (GET) and the save (PATCH); with it both answer 200.
// The permission check is the real one (server/permissions/can.ts) on a hand-made context.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../server/permissions', async () => {
  const can = await vi.importActual<typeof import('../../../../../../server/permissions/can')>(
    '../../../../../../server/permissions/can',
  );
  return { requireApiPermission: vi.fn(), requirePermission: can.requirePermission };
});
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
  return {
    importReadsOrderReport: vi.fn(),
    readImportReview: vi.fn(),
    saveImportReview: vi.fn(),
    ReviewSaveError,
  };
});

import {
  importReadsOrderReport,
  readImportReview,
  saveImportReview,
} from '../../../../../../server/imports/review';
import { requireApiPermission } from '../../../../../../server/permissions';
import { GET, PATCH } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const J = '22222222-2222-4222-8222-222222222222';
const params = { params: Promise.resolve({ id: P, jobId: J }) };
const url = `http://localhost/api/projects/${P}/imports/${J}`;

const member = (...permissions: string[]) =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({
    session: { appUserId: 'u1' },
    ctx: { permissions: new Set(permissions), scope: 'all', listedProjectIds: new Set() },
  } as never);

const get = () => GET(new Request(url), params);
const patch = () =>
  PATCH(
    new Request(url, {
      method: 'PATCH',
      body: JSON.stringify({ changes: [{ item_id: 'ol7', decision: 'accepted', fix: null }] }),
    }),
    params,
  );

const REPORT = { jobId: J, projectId: P, status: 'ready', files: [{ name: 'r.pdf', kind: 'order_report' }] };
const DENIED = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };

describe('EZD-916 Import review of an order report needs See company costs', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET answers 403 without See company costs and 200 with it', async () => {
    member('view_projects', 'edit_model');
    vi.mocked(readImportReview).mockResolvedValueOnce(REPORT as never);
    const refused = await get();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual(DENIED);

    member('view_projects', 'edit_model', 'see_company_costs');
    vi.mocked(readImportReview).mockResolvedValueOnce(REPORT as never);
    const ok = await get();
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { review: { files: unknown } }).review.files).toEqual(REPORT.files);
  });

  it('GET of an import with no order report needs no See company costs', async () => {
    member('view_projects');
    vi.mocked(readImportReview).mockResolvedValueOnce({
      ...REPORT,
      files: [{ name: 'kitchen.pdf', kind: 'supplier_pdf' }],
    } as never);
    expect((await get()).status).toBe(200);
  });

  it('PATCH answers 403 without See company costs and saves nothing; 200 with it', async () => {
    member('view_projects', 'edit_model');
    vi.mocked(importReadsOrderReport).mockResolvedValueOnce(true);
    const refused = await patch();
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual(DENIED);
    expect(importReadsOrderReport).toHaveBeenCalledWith({}, P, J);
    expect(saveImportReview).not.toHaveBeenCalled();

    member('view_projects', 'edit_model', 'see_company_costs');
    vi.mocked(importReadsOrderReport).mockResolvedValueOnce(true);
    vi.mocked(saveImportReview).mockResolvedValueOnce('saved');
    expect((await patch()).status).toBe(200);
  });

  it('PATCH of an import with no order report needs no See company costs', async () => {
    member('view_projects', 'edit_model');
    vi.mocked(importReadsOrderReport).mockResolvedValueOnce(false);
    vi.mocked(saveImportReview).mockResolvedValueOnce('saved');
    expect((await patch()).status).toBe(200);
  });
});
