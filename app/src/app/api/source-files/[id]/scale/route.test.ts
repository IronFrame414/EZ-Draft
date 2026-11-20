// EZD-304 (S01 PDF: scale calibration; Q-0203): the PDF scale route. Mock pattern of EZD-306's layers route test.
// Expected: the documented order (401, 403 from the guard with See projects for GET and Edit model for POST, 404 for
// a hidden, malformed, not-PDF or unfinished file, 400 for an unreadable body or a calibration that cannot measure,
// 500 after reportRouteFailure) and no-store on every answer. The calibration is the fixture's south face (216 pt =
// 144 in, fixtures/synthetic/room-12x10-vector.pdf.expected.json `calibration`).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../server/permissions', () => ({
  requireApiPermission: vi.fn(),
}));
vi.mock('../../../../../server/auth/supabase-server', () => ({
  createSessionClient: () => ({}),
}));
vi.mock('../../../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
vi.mock('../../../../../server/storage', async (orig) => ({
  ...(await orig<typeof import('../../../../../server/storage')>()),
  readPdfScale: vi.fn(),
  setPdfScale: vi.fn(),
}));

import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { readPdfScale, setPdfScale, StorageError } from '../../../../../server/storage';
import { GET, POST } from './route';

const F = '22222222-2222-4222-8222-222222222222';
const P = '11111111-1111-4111-8111-111111111111';
const U = '55555555-5555-4555-8555-555555555555';
const CAL = { page: 1, a: [504, 300], b: [720, 300], lengthIn: 144 };
const VIEW = {
  id: F,
  projectId: P,
  originalName: 'plan.pdf',
  scaleCalibration: CAL,
  uploadedAt: '2026-11-18T00:00:00.000Z',
};

const ctx = (id = F) => ({ params: Promise.resolve({ id }) });
const get = (id = F) => GET(new Request(`http://localhost/api/source-files/${id}/scale`), ctx(id));
const post = (body: unknown, id = F) =>
  POST(
    new Request(`http://localhost/api/source-files/${id}/scale`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    ctx(id),
  );
const permitted = () => ({ session: { appUserId: U }, ctx: {} }) as never;
const denied = (status: number) =>
  Response.json(
    { error: { code: status === 401 ? 'unauthenticated' : 'permission_denied' } },
    {
      status,
    },
  ) as never;
const codeOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('EZD-304 PDF scale route', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('GET answers the scale and the link, with no-store, under See projects', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(permitted());
    vi.mocked(readPdfScale).mockResolvedValueOnce({ ...VIEW, url: 'https://s/x' } as never);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ sourceFile: VIEW, url: 'https://s/x' });
    expect(requireApiPermission).toHaveBeenCalledWith('view_projects');
    expect(readPdfScale).toHaveBeenCalledWith({}, F);
  });

  it('POST stores the scale under Edit model', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(permitted());
    vi.mocked(setPdfScale).mockResolvedValueOnce(VIEW as never);
    const res = await post({ scaleCalibration: CAL });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ sourceFile: VIEW });
    expect(requireApiPermission).toHaveBeenCalledWith('edit_model');
    expect(setPdfScale).toHaveBeenCalledWith({}, F, CAL);
  });

  it('401 and 403 come from the permission guard', async () => {
    for (const status of [401, 403]) {
      vi.mocked(requireApiPermission).mockResolvedValueOnce(denied(status));
      expect((await get()).status).toBe(status);
      vi.mocked(requireApiPermission).mockResolvedValueOnce(denied(status));
      expect((await post({ scaleCalibration: CAL })).status).toBe(status);
    }
    expect(readPdfScale).not.toHaveBeenCalled();
    expect(setPdfScale).not.toHaveBeenCalled();
  });

  it('a hidden, not-PDF or unfinished file is 404; a missing object is 404 on GET', async () => {
    vi.mocked(requireApiPermission).mockResolvedValue(permitted());
    vi.mocked(readPdfScale).mockRejectedValueOnce(new StorageError('source_file_not_found'));
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await codeOf(res)).toBe('source_file_not_found');
    vi.mocked(readPdfScale).mockRejectedValueOnce(new StorageError('object_not_found'));
    expect((await get()).status).toBe(404);
    vi.mocked(setPdfScale).mockRejectedValueOnce(new StorageError('source_file_not_found'));
    expect((await post({ scaleCalibration: CAL })).status).toBe(404);
  });

  it('an unreadable body or a calibration that cannot measure is 400', async () => {
    vi.mocked(requireApiPermission).mockResolvedValue(permitted());
    for (const body of ['{', null, [], { scaleCalibration: CAL, extra: 1 }, {}]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await codeOf(res)).toBe('invalid_input');
    }
    expect(setPdfScale).not.toHaveBeenCalled();
    vi.mocked(setPdfScale).mockRejectedValueOnce(new StorageError('invalid_input'));
    expect((await post({ scaleCalibration: { ...CAL, b: CAL.a } })).status).toBe(400);
  });

  it('any other failure is 500 after reportRouteFailure', async () => {
    vi.mocked(requireApiPermission).mockResolvedValue(permitted());
    vi.mocked(readPdfScale).mockRejectedValueOnce(new Error('down'));
    expect((await get()).status).toBe(500);
    vi.mocked(setPdfScale).mockRejectedValueOnce(new Error('down'));
    expect((await post({ scaleCalibration: CAL })).status).toBe(500);
    expect(reportRouteFailure).toHaveBeenCalledTimes(2);
  });
});
