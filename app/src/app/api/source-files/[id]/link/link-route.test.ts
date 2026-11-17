// EZD-220 (AC-EZD-220-2, -6; Q-0704 10-permissions "Reading pins, photos and notes needs only seeing the project"; "The
// upload route checks Edit model before startSourceFileUpload"; Q-0704 03-data-model "Downloads are signed from the
// row's own storage_path"). Mock pattern of EZD-301's upload-routes.test.ts. Expected: the link route answers 401,
// 403 without See projects, 404 for a file the helper cannot find, 200 with the signed link, no-store on every
// answer; the start route refuses a photo upload without Edit model before the helper runs.
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
vi.mock('../../../../../server/storage', async (orig) => ({
  ...(await orig<typeof import('../../../../../server/storage')>()),
  signPhotoLink: vi.fn(),
  startSourceFileUpload: vi.fn(),
}));

import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { signPhotoLink, startSourceFileUpload, StorageError } from '../../../../../server/storage';
import { POST as start } from '../../../projects/[id]/source-files/route';
import { GET as link } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const F = '22222222-2222-4222-8222-222222222222';
const U = '55555555-5555-4555-8555-555555555555';
const permitted = () => ({ session: { appUserId: U }, ctx: {} }) as never;
const forbidden = () =>
  Response.json(
    { error: { code: 'permission_denied', message_key: 'error.not_authorized' } },
    { status: 403 },
  );
const guard = vi.mocked(requireApiPermission);
const sign = vi.mocked(signPhotoLink);

const callLink = (id: string) =>
  link(new Request(`http://localhost/api/source-files/${id}/link`), {
    params: Promise.resolve({ id }),
  });

describe('EZD-220 photo link route', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('AC-6 needs only See projects; 401 and 403 come before any read', async () => {
    guard.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await callLink(F)).status).toBe(401);
    guard.mockResolvedValueOnce(forbidden());
    expect((await callLink(F)).status).toBe(403);
    expect(sign).not.toHaveBeenCalled();
    guard.mockResolvedValueOnce(permitted());
    sign.mockResolvedValueOnce('https://storage.test/signed?token=t');
    await callLink(F);
    expect(guard).toHaveBeenLastCalledWith('view_projects');
  });

  it('AC-2 answers the link signed from the row, with no-store', async () => {
    guard.mockResolvedValueOnce(permitted());
    sign.mockResolvedValueOnce('https://storage.test/signed?token=t');
    const r = await callLink(F);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toEqual({ url: 'https://storage.test/signed?token=t' });
    expect(sign).toHaveBeenCalledWith({}, F);
  });

  it('AC-6 a file the caller cannot read, or a missing object, is 404; a failure is 500', async () => {
    for (const code of ['source_file_not_found', 'object_not_found'] as const) {
      guard.mockResolvedValueOnce(permitted());
      sign.mockRejectedValueOnce(new StorageError(code));
      const r = await callLink(F);
      expect(r.status).toBe(404);
      expect(r.headers.get('Cache-Control')).toBe('no-store');
    }
    guard.mockResolvedValueOnce(permitted());
    sign.mockRejectedValueOnce(new StorageError('storage_unavailable'));
    expect((await callLink(F)).status).toBe(500);
    expect(reportRouteFailure).toHaveBeenCalledTimes(1);
  });

  it('AC-6 the upload route checks Edit model before starting a photo', async () => {
    guard.mockResolvedValueOnce(forbidden());
    const r = await start(
      new Request(`http://localhost/api/projects/${P}/source-files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'photo',
          originalName: 'leak.jpg',
          contentType: 'image/jpeg',
          size: 1000,
        }),
      }),
      { params: Promise.resolve({ id: P }) },
    );
    expect(r.status).toBe(403);
    expect(guard).toHaveBeenCalledWith('edit_model');
    expect(startSourceFileUpload).not.toHaveBeenCalled();
  });
});
