// EZD-135 U4 (vault/plans/EZD-135.md section 4; AC-EZD-135-1, AC-EZD-135-2, AC-EZD-135-4). Every module the route
// reaches is mocked; no database. Expected values: Decided "Route order", "Query parsing"; ARCH Errors and logging.
// Mock pattern: app/src/app/api/dev/storage/route-permission.test.ts lines 8-31.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permitted } from '../../../../server/permissions/can';
import { requireApiPermission } from '../../../../server/permissions';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import {
  loadBackupStatus,
  loadJobFailures,
  loadWebhookFailures,
} from '../../../../server/system-status/system-status';
import { GET } from './route';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock('../../../../server/permissions', async (orig) => ({
  ...(await orig<typeof import('../../../../server/permissions')>()),
  requireApiPermission: vi.fn(),
}));
vi.mock('../../../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../../../server/system-status/system-status', () => ({
  loadJobFailures: vi.fn(),
  loadWebhookFailures: vi.fn(),
  loadBackupStatus: vi.fn(),
}));
vi.mock('../../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));

const PERMITTED: Permitted = {
  session: { authUserId: 'a1', appUserId: 'u1', email: 'a@example.test' },
  ctx: {
    appUserId: 'u1',
    membershipId: 'm1',
    scope: 'all',
    permissions: new Set(['settings_system_status']),
    listedProjectIds: new Set(),
  },
} as unknown as Permitted;

const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const BASE = 'http://127.0.0.1:3000/api/settings/system-status';

const guard = vi.mocked(requireApiPermission);
const jobs = vi.mocked(loadJobFailures);
const webhooks = vi.mocked(loadWebhookFailures);
const backups = vi.mocked(loadBackupStatus);

function noLoaderCalled() {
  expect(jobs).not.toHaveBeenCalled();
  expect(webhooks).not.toHaveBeenCalled();
  expect(backups).not.toHaveBeenCalled();
}

describe('EZD-135 system status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("U4 (a) without the switch the guard's answer is returned and no loader runs", async () => {
    const denied = Response.json(FORBIDDEN, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
    guard.mockResolvedValueOnce(denied);
    const res = await GET(new Request(`${BASE}?part=jobs`));
    expect(res).toBe(denied);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard).toHaveBeenCalledWith('settings_system_status');
    noLoaderCalled();
  });

  it('U4 (b) a bad query is 400 invalid_input', async () => {
    for (const q of ['?part=nope', '?part=jobs&page=0']) {
      guard.mockResolvedValueOnce(PERMITTED);
      const res = await GET(new Request(`${BASE}${q}`));
      expect(res.status, q).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: 'invalid_input', message_key: 'error.invalid_input' },
      });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
    noLoaderCalled();
  });

  it('U4 (c) jobs and webhooks return the loader page', async () => {
    const jobsPage = { rows: [], total: 0, page: 2, pageSize: 50 };
    guard.mockResolvedValueOnce(PERMITTED);
    jobs.mockResolvedValueOnce(jobsPage);
    const a = await GET(new Request(`${BASE}?part=jobs&page=2`));
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual(jobsPage);
    expect(a.headers.get('Cache-Control')).toBe('no-store');
    expect(jobs).toHaveBeenCalledWith({}, 2);

    const hooksPage = { rows: [], total: 0, page: 1, pageSize: 50 };
    guard.mockResolvedValueOnce(PERMITTED);
    webhooks.mockResolvedValueOnce(hooksPage);
    const b = await GET(new Request(`${BASE}?part=webhooks`));
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual(hooksPage);
    expect(b.headers.get('Cache-Control')).toBe('no-store');
    expect(webhooks).toHaveBeenCalledWith({}, 1);
  });

  it('U4 (d) backups: refused is 403, else the status', async () => {
    guard.mockResolvedValueOnce(PERMITTED);
    backups.mockResolvedValueOnce({ ok: false, code: 'permission_denied' });
    const a = await GET(new Request(`${BASE}?part=backups&page=3`));
    expect(a.status).toBe(403);
    expect(await a.json()).toEqual(FORBIDDEN);
    expect(a.headers.get('Cache-Control')).toBe('no-store');

    guard.mockResolvedValueOnce(PERMITTED);
    backups.mockResolvedValueOnce({
      ok: true,
      status: { files: null, dbDump: null, restoreDrill: null },
    });
    const b = await GET(new Request(`${BASE}?part=backups&page=3`));
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual({ files: null, dbDump: null, restoreDrill: null });
    expect(b.headers.get('Cache-Control')).toBe('no-store');
    expect(backups).toHaveBeenCalledWith({});
  });

  it('U4 (e) a throw is reported and 500 db_unavailable', async () => {
    const DB_UNAVAILABLE = {
      error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
    };
    const boom = new Error('boom');
    guard.mockResolvedValueOnce(PERMITTED);
    webhooks.mockRejectedValueOnce(boom);
    const a = await GET(new Request(`${BASE}?part=webhooks`));
    expect(a.status).toBe(500);
    expect(await a.json()).toEqual(DB_UNAVAILABLE);
    expect(a.headers.get('Cache-Control')).toBe('no-store');
    expect(reportRouteFailure).toHaveBeenCalledTimes(1);
    expect(reportRouteFailure).toHaveBeenLastCalledWith(boom, '/api/settings/system-status');

    vi.clearAllMocks();
    const ctxFail = new Error('ctx');
    guard.mockRejectedValueOnce(ctxFail);
    const b = await GET(new Request(`${BASE}?part=jobs`));
    expect(b.status).toBe(500);
    expect(await b.json()).toEqual(DB_UNAVAILABLE);
    expect(b.headers.get('Cache-Control')).toBe('no-store');
    expect(reportRouteFailure).toHaveBeenCalledTimes(1);
    expect(reportRouteFailure).toHaveBeenLastCalledWith(ctxFail, '/api/settings/system-status');
    noLoaderCalled();
  });
});
