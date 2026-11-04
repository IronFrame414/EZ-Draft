// EZD-140 T7b (vault/plans/EZD-140.md D7, section 4; AC-EZD-140-1, -4). No database: requireApiSession,
// createSessionClient, currentTenantId, the server notifications/settings module and reportRouteFailure are
// mocked. Expected values: D7 (no tenant = 403 permission_denied / error.not_authorized; RPC 42501 = 403, 22023 =
// 400 invalid_input; anything else = reportRouteFailure(e, '/api/profile/notifications') once and 500
// db_unavailable), ARCH Errors and logging.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_KINDS } from '../../../../lib/notifications/kinds';

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  createSessionClient: vi.fn(),
  currentTenantId: vi.fn(),
  getMyNotificationSettings: vi.fn(),
  saveMyNotificationSettings: vi.fn(),
  reportRouteFailure: vi.fn(),
}));

vi.mock('../../../../server/auth/session', () => ({
  requireApiSession: mocks.requireApiSession,
}));
vi.mock('../../../../server/auth/supabase-server', () => ({
  createSessionClient: mocks.createSessionClient,
}));
vi.mock('../../../../server/company/company', () => ({
  currentTenantId: mocks.currentTenantId,
}));
vi.mock('../../../../server/notifications/settings', () => ({
  getMyNotificationSettings: mocks.getMyNotificationSettings,
  saveMyNotificationSettings: mocks.saveMyNotificationSettings,
}));
vi.mock('../../../../server/errors/route-failure', () => ({
  reportRouteFailure: mocks.reportRouteFailure,
}));

const ROUTE = '/api/profile/notifications';
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };
const UNAVAILABLE = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };

const settings = NOTIFICATION_KINDS.map((kind) => ({ kind, inApp: true, email: true }));
const putRequest = () =>
  new Request('http://localhost/api/profile/notifications', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings }),
  });

async function run(method: 'GET' | 'PUT'): Promise<{ res: Response; json: unknown }> {
  const mod = await import('./route');
  const res = method === 'GET' ? await mod.GET() : await mod.PUT(putRequest());
  return { res, json: await res.json() };
}

describe('EZD-140 notification settings route errors', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      authUserId: 'auth-1',
      appUserId: 'user-1',
      email: 'a@example.test',
    });
    mocks.createSessionClient.mockReturnValue({});
    mocks.currentTenantId.mockResolvedValue('tenant-1');
    mocks.getMyNotificationSettings.mockResolvedValue(settings);
    mocks.saveMyNotificationSettings.mockResolvedValue(undefined);
    mocks.reportRouteFailure.mockResolvedValue(undefined);
  });

  it('EZD-140 T7b no tenant answers 403 permission_denied on GET and on PUT, and nothing is reported', async () => {
    mocks.currentTenantId.mockResolvedValue(null);
    for (const method of ['GET', 'PUT'] as const) {
      const { res, json } = await run(method);
      expect(res.status).toBe(403);
      expect(json).toEqual(FORBIDDEN);
      expect(res.headers.get('cache-control') ?? '').toContain('no-store');
    }
    expect(mocks.reportRouteFailure).not.toHaveBeenCalled();
  });

  it('EZD-140 T7b a save refused with 42501 is 403 and one refused with 22023 is 400', async () => {
    mocks.saveMyNotificationSettings.mockRejectedValueOnce({ code: '42501' });
    const forbidden = await run('PUT');
    expect(forbidden.res.status).toBe(403);
    expect(forbidden.json).toEqual(FORBIDDEN);

    mocks.saveMyNotificationSettings.mockRejectedValueOnce({ code: '22023' });
    const invalid = await run('PUT');
    expect(invalid.res.status).toBe(400);
    expect(invalid.json).toEqual(INVALID);

    expect(mocks.reportRouteFailure).not.toHaveBeenCalled();
  });

  it('EZD-140 T7b any other save error is reported once for the route and answers 500 db_unavailable', async () => {
    const boom = new Error('boom');
    mocks.saveMyNotificationSettings.mockRejectedValueOnce(boom);
    const { res, json } = await run('PUT');
    expect(res.status).toBe(500);
    expect(json).toEqual(UNAVAILABLE);
    expect(res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(mocks.reportRouteFailure).toHaveBeenCalledTimes(1);
    expect(mocks.reportRouteFailure).toHaveBeenCalledWith(boom, ROUTE);
  });

  it('EZD-140 T7b a failed read is reported once for the route and answers 500 db_unavailable', async () => {
    const boom = new Error('boom');
    mocks.getMyNotificationSettings.mockRejectedValueOnce(boom);
    const { res, json } = await run('GET');
    expect(res.status).toBe(500);
    expect(json).toEqual(UNAVAILABLE);
    expect(res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(mocks.reportRouteFailure).toHaveBeenCalledTimes(1);
    expect(mocks.reportRouteFailure).toHaveBeenCalledWith(boom, ROUTE);
  });
});
