// EZD-237 T20, T21 (vault/plans/EZD-237.md section 3 C4, section 4; AC-EZD-237-1, -2). Same sign-in and
// next/headers mock as ../project/route.test.ts; `recordBenchmarkRun`, `listBenchmarkRuns` and `reportRouteFailure`
// are mocked (no rows are written, no error alert is stored). Expected values: Decided D-Route (GET: System
// status, then the page, then the list; POST: System status, Edit model, the body, then the write; 201
// `{ run: { id } }`; every response `no-store`), D-Page, D-Input; section 3 C4 (401 `not_signed_in`; 403
// `permission_denied` / `error.not_authorized`; 400 `invalid_input` / `error.invalid_input`; 500 `db_unavailable`);
// ARCH Errors and logging (`reportRouteFailure(e, '/api/benchmark/runs')`); BENCHMARK_PAGE_SIZE 50 (Q-0664).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));
const mocks = vi.hoisted(() => ({
  recordBenchmarkRun: vi.fn(),
  listBenchmarkRuns: vi.fn(),
  reportRouteFailure: vi.fn(async () => {}),
}));

vi.mock('../../../../server/benchmark/benchmark-runs', () => ({
  recordBenchmarkRun: mocks.recordBenchmarkRun,
  listBenchmarkRuns: mocks.listBenchmarkRuns,
}));

vi.mock('../../../../server/errors/route-failure', () => ({
  reportRouteFailure: mocks.reportRouteFailure,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

function jarOver(store: Map<string, string>): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const { error } = await createSessionClient(jarOver(store)).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };
const DB_UNAVAILABLE = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };
const ID = '3f2b8c1e-5d4a-4c7e-9b1a-0e6d2f4a8c10';
const STEP = { frames: 180, meanMs: 6, p95Ms: 12, maxMs: 40, over100: 0 };
const BODY = {
  device: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36',
    screen: { width: 1600, height: 1000 },
    devicePixelRatio: 1,
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
  },
  appVersion: 'dev-1730000000',
  results: { pan: STEP, zoom: STEP, drag: STEP, memory: null },
};

async function post(body: string = JSON.stringify(BODY)) {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/benchmark/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );
  return { res, json: JSON.parse(await res.text()) as unknown };
}

async function get(query = '') {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/benchmark/runs${query}`));
  return { res, json: JSON.parse(await res.text()) as unknown };
}

describe('EZD-237 benchmark runs route', () => {
  let ownerCookies: Map<string, string>;
  let noSystemCookies: Map<string, string>;
  let noEditCookies: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    const make = async (permissions: string[]) => {
      const m = await createMember({ tenantId: tenant, scope: 'all' });
      await setPermissions(tenant, m.membershipId, permissions as never);
      return cookiesFor(m.email);
    };
    ownerCookies = await make(['view_projects', 'edit_model', 'settings_system_status']);
    noSystemCookies = await make(['view_projects', 'edit_model']);
    noEditCookies = await make(['view_projects', 'settings_system_status']);
  }, 180000);

  beforeEach(() => {
    mocks.recordBenchmarkRun.mockReset();
    mocks.listBenchmarkRuns.mockReset();
    mocks.reportRouteFailure.mockClear();
  });

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-237 T20 POST guard: 401, 403 without System status, 403 without Edit model', async () => {
    state.store = new Map();
    const a = await post();
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);
    expect(a.res.headers.get('Cache-Control')).toBe('no-store');
    for (const cookies of [noSystemCookies, noEditCookies]) {
      state.store = new Map(cookies);
      const b = await post();
      expect(b.res.status).toBe(403);
      expect(b.json).toEqual(FORBIDDEN);
      expect(b.res.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(mocks.recordBenchmarkRun).not.toHaveBeenCalled();
  });

  it('EZD-237 T20 POST body: 400 for unreadable JSON and for a body that is not a run', async () => {
    state.store = new Map(ownerCookies);
    for (const body of ['not json', JSON.stringify({ ...BODY, appVersion: 'v1' })]) {
      const r = await post(body);
      expect(r.res.status).toBe(400);
      expect(r.json).toEqual(INVALID);
      expect(r.res.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(mocks.recordBenchmarkRun).not.toHaveBeenCalled();
  });

  it('EZD-237 T20 POST write: 201, the database refusals, and a failure', async () => {
    state.store = new Map(ownerCookies);
    mocks.recordBenchmarkRun.mockResolvedValueOnce({ ok: true, id: ID });
    const ok = await post();
    expect(ok.res.status).toBe(201);
    expect(ok.json).toEqual({ run: { id: ID } });
    expect(ok.res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.recordBenchmarkRun).toHaveBeenCalledWith(expect.anything(), BODY);

    mocks.recordBenchmarkRun.mockResolvedValueOnce({ ok: false, code: 'permission_denied' });
    const denied = await post();
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual(FORBIDDEN);

    mocks.recordBenchmarkRun.mockResolvedValueOnce({ ok: false, code: 'invalid_input' });
    const invalid = await post();
    expect(invalid.res.status).toBe(400);
    expect(invalid.json).toEqual(INVALID);

    const boom = new Error('boom');
    mocks.recordBenchmarkRun.mockRejectedValueOnce(boom);
    const failed = await post();
    expect(failed.res.status).toBe(500);
    expect(failed.json).toEqual(DB_UNAVAILABLE);
    expect(failed.res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.reportRouteFailure).toHaveBeenCalledTimes(1);
    expect(mocks.reportRouteFailure).toHaveBeenCalledWith(boom, '/api/benchmark/runs');
  });

  it('EZD-237 T21 GET: 401, 403, 400, 200 page, 403 refused, 500', async () => {
    state.store = new Map();
    const a = await get();
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);
    expect(a.res.headers.get('Cache-Control')).toBe('no-store');

    state.store = new Map(noSystemCookies);
    const b = await get();
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);
    expect(b.res.headers.get('Cache-Control')).toBe('no-store');

    state.store = new Map(ownerCookies);
    const c = await get('?page=0');
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(INVALID);
    expect(c.res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.listBenchmarkRuns).not.toHaveBeenCalled();

    const page = {
      rows: [{ ...BODY, id: ID, runAt: '2026-11-11T15:20:00.000Z' }],
      total: 1,
      page: 2,
      pageSize: 50,
    };
    mocks.listBenchmarkRuns.mockResolvedValueOnce({ ok: true, page });
    const d = await get('?page=2');
    expect(d.res.status).toBe(200);
    expect(d.json).toEqual(page);
    expect(d.res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.listBenchmarkRuns).toHaveBeenCalledWith(expect.anything(), 2);

    mocks.listBenchmarkRuns.mockResolvedValueOnce({ ok: false, code: 'permission_denied' });
    const e = await get();
    expect(e.res.status).toBe(403);
    expect(e.json).toEqual(FORBIDDEN);
    expect(mocks.listBenchmarkRuns).toHaveBeenLastCalledWith(expect.anything(), 1);

    const boom = new Error('boom');
    mocks.listBenchmarkRuns.mockRejectedValueOnce(boom);
    const f = await get();
    expect(f.res.status).toBe(500);
    expect(f.json).toEqual(DB_UNAVAILABLE);
    expect(f.res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.reportRouteFailure).toHaveBeenCalledWith(boom, '/api/benchmark/runs');
  });
});
