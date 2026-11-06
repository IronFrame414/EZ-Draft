// EZD-236 R1-R4 (vault/plans/EZD-236.md section 3 route row, section 4; AC-EZD-236-2). Same sign-in and
// next/headers mock as app/src/app/api/realtime/token/route.test.ts; `ensureBenchmarkProject` and
// `reportRouteFailure` are mocked (no benchmark rows are written, no error alert is stored). Expected values:
// Decided "Route order" (guard `settings_system_status`, then `edit_model`, then the call; 201 when created,
// else 200; `{ project: { id } }`; every response `no-store`), "Request body" (never read), section 3 route row
// (401 `not_signed_in`; 403 `permission_denied` / `error.not_authorized`; 500 `db_unavailable` /
// `error.db_unavailable`), ARCH Errors and logging (`reportRouteFailure(e, '/api/benchmark/project')`).
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
  ensureBenchmarkProject: vi.fn(),
  reportRouteFailure: vi.fn(async () => {}),
}));

vi.mock('../../../../server/benchmark/benchmark-project', () => ({
  ensureBenchmarkProject: mocks.ensureBenchmarkProject,
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
const DB_UNAVAILABLE = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };
const ID = '3f2b8c1e-5d4a-4c7e-9b1a-0e6d2f4a8c10';

async function post(body?: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/benchmark/project', { method: 'POST', body }),
  );
  return { res, json: JSON.parse(await res.text()) as unknown };
}

describe('EZD-236 benchmark project route', () => {
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
    mocks.ensureBenchmarkProject.mockReset();
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

  it('EZD-236 R1 guard: 401 with no session, 403 without System status, 403 without edit_model', async () => {
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
    expect(mocks.ensureBenchmarkProject).not.toHaveBeenCalled();
  });

  it('EZD-236 R2 success: 201 when made now, 200 when already there, a bad body changes nothing', async () => {
    state.store = new Map(ownerCookies);
    mocks.ensureBenchmarkProject.mockResolvedValueOnce({ ok: true, projectId: ID, created: true });
    const made = await post('{bad json');
    expect(made.res.status).toBe(201);
    expect(made.json).toEqual({ project: { id: ID } });
    expect(made.res.headers.get('Cache-Control')).toBe('no-store');

    mocks.ensureBenchmarkProject.mockResolvedValueOnce({ ok: true, projectId: ID, created: false });
    const again = await post();
    expect(again.res.status).toBe(200);
    expect(again.json).toEqual({ project: { id: ID } });
    expect(again.res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('EZD-236 R3 refused by the database: 403 permission_denied', async () => {
    state.store = new Map(ownerCookies);
    mocks.ensureBenchmarkProject.mockResolvedValueOnce({ ok: false, code: 'permission_denied' });
    const r = await post();
    expect(r.res.status).toBe(403);
    expect(r.json).toEqual(FORBIDDEN);
    expect(r.res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('EZD-236 R4 failure: 500 db_unavailable and the failure is reported with the route', async () => {
    state.store = new Map(ownerCookies);
    const boom = new Error('boom');
    mocks.ensureBenchmarkProject.mockRejectedValueOnce(boom);
    const r = await post();
    expect(r.res.status).toBe(500);
    expect(r.json).toEqual(DB_UNAVAILABLE);
    expect(r.res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.reportRouteFailure).toHaveBeenCalledWith(boom, '/api/benchmark/project');
  });
});
