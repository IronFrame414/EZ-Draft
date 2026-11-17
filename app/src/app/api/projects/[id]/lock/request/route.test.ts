// EZD-125 (S06:20, 75; Q-0697 decisions 03 "Auto release", 10; S15d:45; Q-0188; AC-EZD-125-5, -7): Request edit
// and Cancel request against the real database. Expected values: the deadline is the request time plus the
// company's Defaults minutes (registry default 5, S15d:45; 09o deadline rows 1-3), and the route file header.
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

const minutesOf = (r: { requestedAt: string; deadlineAt: string }) =>
  (Date.parse(r.deadlineAt) - Date.parse(r.requestedAt)) / 60000;

describe('EZD-125 lock request route', () => {
  const w = setup();

  it('AC-EZD-125-5 401, 403 without Edit model, 404; a request on a free lock answers that it is free', async () => {
    as(null);
    expect(await request(w.project)).toEqual({ status: 401, json: NOT_SIGNED_IN });
    as(w.viewer);
    expect(await request(w.project)).toEqual({ status: 403, json: FORBIDDEN });
    as(w.outsider);
    expect(await request(w.project)).toEqual({ status: 404, json: NOT_FOUND });
    as(w.b);
    expect(await request('nope')).toEqual({ status: 404, json: NOT_FOUND });
    expect(await request(w.project)).toEqual({ status: 200, json: { lockFree: true } });
  }, 60000);

  it('AC-EZD-125-5 the holder is refused, a second pending request is refused, Cancel removes it and a new one is accepted', async () => {
    as(w.a);
    await acquire(w.project);
    expect(await request(w.project)).toEqual({ status: 409, json: err('own_lock') });
    as(w.b);
    const first = await request(w.project);
    expect(first.status).toBe(201);
    expect(await request(w.project)).toEqual({ status: 409, json: err('request_pending') });
    const id = (first.json as { request: { id: string } }).request.id;
    expect(await cancel(w.project)).toEqual({ status: 200, json: { request: { id } } });
    expect(await cancel(w.project)).toEqual({ status: 404, json: err('request_not_found') });
    expect((await request(w.project)).status).toBe(201);
  }, 60000);

  it('AC-EZD-125-7 the deadline is the Defaults minutes read at request time (default 5, then 1); a later change does not move it', async () => {
    as(w.c);
    const five = await request(w.project);
    expect(five.status).toBe(201);
    const r5 = (five.json as { request: { requestedAt: string; deadlineAt: string } }).request;
    expect(minutesOf(r5)).toBe(5);
    await harnessSql()`update public.tenant set defaults = '{"edit_lock_auto_release": 1}'::jsonb
      where id = ${w.tenant}::uuid`;
    as(w.b);
    await cancel(w.project);
    const one = await request(w.project);
    const r1 = (one.json as { request: { requestedAt: string; deadlineAt: string } }).request;
    expect(minutesOf(r1)).toBe(1);
    // C's open request keeps its 5-minute deadline.
    const rows = await harnessSql()<{ deadline_at: Date }[]>`
      select deadline_at from public.edit_request
      where project_id = ${w.project}::uuid and requester_app_user_id = ${w.c.member.appUserId}::uuid`;
    expect(rows[0].deadline_at.toISOString()).toBe(new Date(r5.deadlineAt).toISOString());
  }, 60000);

  it('AC-EZD-125-1 an unanswered request releases the lock at its deadline (the next request sees it free)', async () => {
    await backdateRequests(w.project);
    as(w.b);
    expect(await request(w.project)).toEqual({ status: 200, json: { lockFree: true } });
    expect((await lockRows(w.project)).holder_app_user_id).toBeNull();
  }, 60000);
});
