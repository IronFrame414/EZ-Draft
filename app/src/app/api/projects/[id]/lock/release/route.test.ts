// EZD-125 (S06 Decision 12; Q-0697 decisions 04, 10; AC-EZD-125-6, -8, -10): the release route against the
// real database. Expected values: the route file header (409 not_lock_holder, 409 stale_lock_epoch) and the
// EZD-120a error mapping.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../../test-harness/rls/fixtures';
import {
  backdateRequests,
  callRoute,
  lockRows,
  routePerson,
  type RoutePerson,
} from '../../../../../../../test-harness/lock/route-session';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));

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

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const NOT_FOUND = { error: { code: 'project_not_found', message_key: 'error.project_not_found' } };
const err = (code: string, key = `error.${code}`) => ({ error: { code, message_key: key } });

const as = (p: RoutePerson | null) => {
  state.store = new Map(p?.cookies ?? []);
};
const acquire = async (id: string) => {
  const { POST } = await import('../route');
  return callRoute(POST, { path: `/api/projects/${id}/lock`, id, method: 'POST', body: {} });
};
const release = async (id: string, body: unknown) => {
  const { POST } = await import('../release/route');
  return callRoute(POST, { path: `/api/projects/${id}/lock/release`, id, method: 'POST', body });
};
const request = async (id: string) => {
  const { POST } = await import('../request/route');
  return callRoute(POST, { path: `/api/projects/${id}/lock/request`, id, method: 'POST' });
};
const cancel = async (id: string) => {
  const { DELETE } = await import('../request/route');
  return callRoute(DELETE, { path: `/api/projects/${id}/lock/request`, id, method: 'DELETE' });
};
const respond = async (id: string, body: unknown) => {
  const { POST } = await import('../respond/route');
  return callRoute(POST, { path: `/api/projects/${id}/lock/respond`, id, method: 'POST', body });
};

const setup = () => {
  const w = {} as {
    tenant: string;
    project: string;
    a: RoutePerson;
    b: RoutePerson;
    c: RoutePerson;
    viewer: RoutePerson;
    outsider: RoutePerson;
  };
  beforeAll(async () => {
    w.tenant = await createTenant();
    [w.project] = await createProjects(w.tenant, 1);
    w.a = await routePerson(w.tenant, 'Ana Holder', ['view_projects', 'edit_model']);
    w.b = await routePerson(w.tenant, 'Ben Requester', ['view_projects', 'edit_model']);
    w.c = await routePerson(w.tenant, 'Cal Third', ['view_projects', 'edit_model']);
    w.viewer = await routePerson(w.tenant, 'Vic Viewer', ['view_projects']);
    w.outsider = await routePerson(await createTenant(), 'Oz Outside', [
      'view_projects',
      'edit_model',
    ]);
  }, 180000);
  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });
  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });
  return w;
};

describe('EZD-125 lock release route', () => {
  const w = setup();

  it('AC-EZD-125-10 401, 404, 400 for a bad body; only the holder releases', async () => {
    as(null);
    expect(await release(w.project, { reason: 'stop_editing' })).toEqual({
      status: 401,
      json: NOT_SIGNED_IN,
    });
    as(w.a);
    expect(await release('nope', { reason: 'stop_editing' })).toEqual({
      status: 404,
      json: NOT_FOUND,
    });
    expect((await release(w.project, { reason: 'request_accepted' })).status).toBe(400);
    expect((await release(w.project, '{')).status).toBe(400);
    expect((await acquire(w.project)).status).toBe(200);
    for (const p of [w.b, w.viewer]) {
      as(p);
      expect(await release(w.project, { reason: 'stop_editing' })).toEqual({
        status: 409,
        json: err('not_lock_holder'),
      });
    }
    as(w.outsider);
    expect(await release(w.project, { reason: 'stop_editing' })).toEqual({
      status: 404,
      json: NOT_FOUND,
    });
    expect((await lockRows(w.project)).holder_app_user_id).toBe(w.a.member.appUserId);
  }, 60000);

  it('AC-EZD-125-8 a tab close with an old epoch is refused; with its epoch it releases; Stop editing releases', async () => {
    as(w.a);
    expect(await release(w.project, { reason: 'closed', lockEpoch: 0 })).toEqual({
      status: 409,
      json: err('stale_lock_epoch'),
    });
    expect(await release(w.project, { reason: 'closed', lockEpoch: 1 })).toEqual({
      status: 200,
      json: { lock: { lockEpoch: 2 } },
    });
    expect((await acquire(w.project)).status).toBe(200);
    expect(await release(w.project, { reason: 'stop_editing' })).toEqual({
      status: 200,
      json: { lock: { lockEpoch: 4 } },
    });
    const reasons = await harnessSql()<{ reason: string }[]>`
      select details ->> 'reason' as reason from public.event_log
      where object_id = ${w.project}::uuid and action = 'lock.released' order by at, id`;
    expect(reasons.map((r) => r.reason)).toEqual(['closed', 'stop_editing']);
  }, 60000);
});
