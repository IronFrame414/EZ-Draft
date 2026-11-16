// EZD-125 (S06 Edit lock; Q-0697 decisions 03, 10; 04:90; S03:16-17; AC-EZD-125-2, -4, -7): the lock read
// and Start editing routes, against the real database, signed in as the checkpoints route test does.
// Expected values: the route answers of the route file header; 401 / 403 `error.not_authorized` / 404
// `project_not_found` as EZD-120a's Decided "Error mapping"; the holder's name from the S06 banner text.
import { holdJobQueueShared } from '../../../../../../test-harness/jobs/queue-lock';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../test-harness/rls/fixtures';
import {
  backdateRequests,
  callRoute,
  lockRows,
  routePerson,
  type RoutePerson,
} from '../../../../../../test-harness/lock/route-session';

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

const as = (p: RoutePerson | null) => {
  state.store = new Map(p?.cookies ?? []);
};
const read = async (id: string) => {
  const { GET } = await import('./route');
  return callRoute(GET, { path: `/api/projects/${id}/lock`, id, method: 'GET' });
};
const acquire = async (id: string, body: unknown = { deviceId: 'device-1' }) => {
  const { POST } = await import('./route');
  return callRoute(POST, {
    path: `/api/projects/${id}/lock`,
    id,
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': '198.51.100.4' },
  });
};

describe('EZD-125 lock route', () => {
  let tenant = '';
  let project = '';
  let other = '';
  let a: RoutePerson;
  let b: RoutePerson;
  let viewer: RoutePerson;
  let outsider: RoutePerson;

  // A request inserts a notification_email job (create_notification), so the job queue is held shared.
  let releaseQueue: () => Promise<void> = async () => {};
  beforeAll(async () => {
    releaseQueue = await holdJobQueueShared();
    tenant = await createTenant();
    [project, other] = await createProjects(tenant, 2);
    a = await routePerson(tenant, 'Ana Holder', ['view_projects', 'edit_model']);
    b = await routePerson(tenant, 'Ben Requester', ['view_projects', 'edit_model']);
    viewer = await routePerson(tenant, 'Vic Viewer', ['view_projects']);
    const otherTenant = await createTenant();
    outsider = await routePerson(otherTenant, 'Oz Outside', ['view_projects', 'edit_model']);
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

  it('AC-EZD-125-4 401 without a session, 403 Start editing without Edit model, 404 for a bad id or another company', async () => {
    as(null);
    expect(await read(project)).toEqual({ status: 401, json: NOT_SIGNED_IN });
    expect(await acquire(project)).toEqual({ status: 401, json: NOT_SIGNED_IN });
    as(viewer);
    expect(await acquire(project)).toEqual({ status: 403, json: FORBIDDEN });
    as(a);
    expect(await read('nope')).toEqual({ status: 404, json: NOT_FOUND });
    expect(await acquire('nope')).toEqual({ status: 404, json: NOT_FOUND });
    expect((await acquire(project, { deviceId: 'x'.repeat(101) })).status).toBe(400);
    expect((await acquire(project, { extra: 1 })).status).toBe(400);
    as(outsider);
    expect(await read(project)).toEqual({ status: 404, json: NOT_FOUND });
    expect(await acquire(project)).toEqual({ status: 404, json: NOT_FOUND });
    expect(await lockRows(project)).toBeUndefined();
  }, 60000);

  it('AC-EZD-125-4 a free lock goes to a user with Edit model; anyone else is told who holds it (409 lock_held with the name)', async () => {
    as(a);
    const first = await acquire(project);
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ lock: { lockEpoch: 1 } });
    // A second tab: the same epoch.
    expect((await acquire(project, {})).json).toMatchObject({ lock: { lockEpoch: 1 } });
    as(b);
    const held = await acquire(project);
    expect(held.status).toBe(409);
    expect(held.json).toMatchObject({
      error: { code: 'lock_held', message_key: 'error.lock_held' },
      holder: { appUserId: a.member.appUserId, name: 'Ana Holder' },
    });
    expect((await lockRows(project)).holder_app_user_id).toBe(a.member.appUserId);
    // The acquire's event_log row carries the request IP.
    const ip = await harnessSql()<{ ip: string }[]>`
      select host(ip) as ip from public.event_log where object_id = ${project}::uuid and action = 'lock.acquired'`;
    expect(ip.map((r) => r.ip)).toEqual(['198.51.100.4']);
  }, 60000);

  it('AC-EZD-125-4 the lock read gives any member the holder name and since; a viewer reads it too', async () => {
    as(viewer);
    const r = await read(project);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      lock: {
        lockEpoch: 1,
        holder: { appUserId: a.member.appUserId, name: 'Ana Holder' },
        myRequest: null,
        requests: [],
      },
    });
    expect(typeof (r.json as { lock: { since: unknown } }).lock.since).toBe('string');
    as(a);
    expect((await read(other)).json).toMatchObject({ lock: { lockEpoch: 0, holder: null } });
  }, 60000);

  it('AC-EZD-125-7 every lock read applies an expired deadline on the database clock', async () => {
    as(b);
    const { POST } = await import('./request/route');
    const req = await callRoute(POST, {
      path: `/api/projects/${project}/lock/request`,
      id: project,
      method: 'POST',
    });
    expect(req.status).toBe(201);
    as(a);
    expect((await read(project)).json).toMatchObject({
      lock: {
        holder: { appUserId: a.member.appUserId },
        requests: [{ requesterName: 'Ben Requester' }],
      },
    });
    await backdateRequests(project);
    as(viewer);
    expect((await read(project)).json).toMatchObject({ lock: { lockEpoch: 2, holder: null } });
  }, 60000);
});
