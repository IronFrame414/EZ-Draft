// EZD-117a R3 (vault/plans/EZD-117a.md section 4; AC-EZD-117a-1, -3). Expected values: Decided "Routes" (a thrown
// read answers 500 `db_unavailable` / `error.db_unavailable` with no-store, and `reportRouteFailure(e, ROUTE)` is
// called with the route pattern); ARCH Errors and logging; lesson EZD-169. No database: the permission guard,
// the session client and the two reads are mocked.
import { afterEach, describe, expect, it, vi } from 'vitest';

const boom = new Error('boom');
vi.mock('../../../server/permissions', () => ({ requireApiPermission: vi.fn(async () => ({})) }));
vi.mock('../../../server/auth/supabase-server', () => ({ createSessionClient: () => ({}) }));
vi.mock('../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
vi.mock('../../../server/projects/projects', async (orig) => ({
  ...(await orig<typeof import('../../../server/projects/projects')>()),
  listProjects: vi.fn(async () => {
    throw boom;
  }),
  countProjects: vi.fn(async () => {
    throw boom;
  }),
}));

import { reportRouteFailure } from '../../../server/errors/route-failure';
import { GET as listGet } from './route';
import { GET as countsGet } from './counts/route';

const report = vi.mocked(reportRouteFailure);
const FAILED = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };

describe('EZD-117a projects routes report a failed read', () => {
  afterEach(() => report.mockClear());

  it('R3 a rejected read answers 500 db_unavailable and is reported with its route', async () => {
    const a = await listGet(new Request('http://localhost/api/projects'));
    expect(a.status).toBe(500);
    expect(await a.json()).toEqual(FAILED);
    expect(a.headers.get('cache-control') ?? '').toContain('no-store');
    expect(report).toHaveBeenLastCalledWith(boom, '/api/projects');

    const b = await (countsGet as unknown as (r?: Request) => Promise<Response>)(
      new Request('http://localhost/api/projects/counts'),
    );
    expect(b.status).toBe(500);
    expect(await b.json()).toEqual(FAILED);
    expect(b.headers.get('cache-control') ?? '').toContain('no-store');
    expect(report).toHaveBeenLastCalledWith(boom, '/api/projects/counts');
  });
});
