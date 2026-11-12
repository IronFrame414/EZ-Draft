// EZD-349 T3 (vault/plans/EZD-349.md sections 3 and 4; AC-EZD-349-1, AC-EZD-349-2; D-016): signed out, every
// route that uses the guard answers 401 not_signed_in with Cache-Control: no-store, and the answer is the same
// after the per-route patches are removed. next/headers is mocked to an empty cookie store (as
// app/src/app/api/notifications/route.test.ts). Requests are built on http://127.0.0.1:3000 (ARCH Tests).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeHarness } from '../../../test-harness/rls/fixtures';

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

const ORIGIN = 'http://127.0.0.1:3000';
const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const withParams = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (path: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, { method: 'POST', body: JSON.stringify(body) });
const get = (path: string) => new Request(`${ORIGIN}${path}`);

type Call = { route: string; run: () => Promise<Response> };

const calls: Call[] = [
  {
    route: 'GET /api/notifications',
    run: async () => (await import('./notifications/route')).GET(get('/api/notifications')),
  },
  {
    route: 'POST /api/notifications/read-all',
    run: async () =>
      (await import('./notifications/read-all/route')).POST(
        post('/api/notifications/read-all', {}),
      ),
  },
  {
    route: 'POST /api/notifications/<id>/open',
    run: async () =>
      (await import('./notifications/[id]/open/route')).POST(
        post(`/api/notifications/${randomUUID()}/open`, {}),
        withParams(randomUUID()),
      ),
  },
  {
    route: 'POST /api/dev/notifications',
    run: async () =>
      (await import('./dev/notifications/route')).POST(
        post('/api/dev/notifications', { kind: 'render_finished', params: {} }),
      ),
  },
  {
    route: 'GET /api/projects',
    run: async () => (await import('./projects/route')).GET(get('/api/projects')),
  },
  {
    route: 'POST /api/projects',
    run: async () => (await import('./projects/route')).POST(post('/api/projects', {})),
  },
  {
    route: 'GET /api/projects/counts',
    run: async () => (await import('./projects/counts/route')).GET(get('/api/projects/counts')),
  },
  {
    route: 'GET /api/projects/<id>/model',
    run: async () => {
      const id = randomUUID();
      return (await import('./projects/[id]/model/route')).GET(
        get(`/api/projects/${id}/model`),
        withParams(id),
      );
    },
  },
  {
    route: 'POST /api/projects/<id>/checkpoints',
    run: async () => {
      const id = randomUUID();
      return (await import('./projects/[id]/checkpoints/route')).POST(
        post(`/api/projects/${id}/checkpoints`, {}),
        withParams(id),
      );
    },
  },
  // EZD-219 (vault/plans/EZD-219.md section 4): the plan scale route.
  {
    route: 'PUT /api/projects/<id>/plan-scale',
    run: async () => {
      const id = randomUUID();
      return (await import('./projects/[id]/plan-scale/route')).PUT(
        new Request(`${ORIGIN}/api/projects/${id}/plan-scale`, {
          method: 'PUT',
          body: JSON.stringify({ scale: 0.5 }),
        }),
        withParams(id),
      );
    },
  },
  {
    route: 'POST /api/projects/<id>/objects',
    run: async () => {
      const id = randomUUID();
      return (await import('./projects/[id]/objects/route')).POST(
        post(`/api/projects/${id}/objects`, {}),
        withParams(id),
      );
    },
  },
  {
    route: 'GET /api/realtime/token',
    run: async () => (await import('./realtime/token/route')).GET(),
  },
  {
    route: 'GET /api/permissions',
    run: async () => (await import('./permissions/route')).GET(),
  },
];

describe('EZD-349 signed out, every guarded route answers 401 not_signed_in with no-store', () => {
  beforeEach(() => {
    state.store = new Map();
  });

  afterAll(async () => {
    await closeHarness();
  });

  it.each(calls)(
    'EZD-349 T3 signed out, every patched route and /api/permissions answer 401 not_signed_in with no-store: $route',
    async ({ run }) => {
      const res = await run();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual(NOT_SIGNED_IN);
      expect(res.headers.get('cache-control')).toBe('no-store');
    },
  );
});
