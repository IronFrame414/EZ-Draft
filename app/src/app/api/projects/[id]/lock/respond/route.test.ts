// EZD-125 (S06:21, 76, Decision 5; Q-0697 decisions 03, 10; AC-EZD-125-6, -10): Release and Keep editing from
// the holder prompt, against the real database. Expected values: the route file header and 09o deadline row 4.
import { holdJobQueueShared } from '../../../../../../../test-harness/jobs/queue-lock';
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
  // A request inserts a notification_email job (create_notification), so the job queue is held shared.
  let releaseQueue: () => Promise<void> = async () => {};
  beforeAll(async () => {
    releaseQueue = await holdJobQueueShared();
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
    try {
      await cleanup();
      await closeHarness();
    } finally {
      await releaseQueue();
    }
  });
  return w;
};

describe('EZD-125 lock respond route', () => {
  const w = setup();
  let requestId = '';

  it('AC-EZD-125-10 401, 404, 400; only the holder answers a request', async () => {
    as(w.a);
    await acquire(w.project);
    as(w.b);
    requestId = ((await request(w.project)).json as { request: { id: string } }).request.id;
    as(null);
    expect(await respond(w.project, { requestId, response: 'keep' })).toEqual({
      status: 401,
      json: NOT_SIGNED_IN,
    });
    as(w.a);
    expect(await respond('nope', { requestId, response: 'keep' })).toEqual({
      status: 404,
      json: NOT_FOUND,
    });
    expect((await respond(w.project, { requestId, response: 'maybe' })).status).toBe(400);
    expect((await respond(w.project, { requestId: 'x', response: 'keep' })).status).toBe(400);
    for (const p of [w.b, w.c, w.viewer]) {
      as(p);
      expect(await respond(w.project, { requestId, response: 'release' })).toEqual({
        status: 409,
        json: err('not_lock_holder'),
      });
    }
    as(w.outsider);
    expect(await respond(w.project, { requestId, response: 'release' })).toEqual({
      status: 404,
      json: NOT_FOUND,
    });
    expect((await lockRows(w.project)).holder_app_user_id).toBe(w.a.member.appUserId);
  }, 60000);

  it('AC-EZD-125-6 Keep: the lock stays and the requester may ask again at once; Release: released', async () => {
    as(w.a);
    expect(await respond(w.project, { requestId, response: 'keep' })).toEqual({
      status: 200,
      json: { status: 'kept', lock: { lockEpoch: 1 } },
    });
    expect(await respond(w.project, { requestId, response: 'keep' })).toEqual({
      status: 409,
      json: err('request_not_pending'),
    });
    as(w.b);
    const again = await request(w.project);
    expect(again.status).toBe(201);
    requestId = (again.json as { request: { id: string } }).request.id;
    as(w.a);
    expect(await respond(w.project, { requestId, response: 'release' })).toEqual({
      status: 200,
      json: { status: 'released', lock: { lockEpoch: 2 } },
    });
    expect((await lockRows(w.project)).holder_app_user_id).toBeNull();
  }, 60000);

  it('AC-EZD-125-6 a Keep after the deadline loses to the auto release', async () => {
    as(w.a);
    await acquire(w.project);
    as(w.b);
    requestId = ((await request(w.project)).json as { request: { id: string } }).request.id;
    await backdateRequests(w.project);
    as(w.a);
    expect(await respond(w.project, { requestId, response: 'keep' })).toEqual({
      status: 409,
      json: err('not_lock_holder'),
    });
    expect((await lockRows(w.project)).holder_app_user_id).toBeNull();
  }, 60000);
});
