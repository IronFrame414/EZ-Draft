// EZD-132 T18, route part (vault/plans/EZD-132.md section 4; Decided Dev routes): POST /api/dev/storage and
// POST /api/dev/storage/<id>/complete answer 404 in production, before any session or body work, and 401
// not_signed_in with no session. Pattern app/src/app/api/dev/jobs/route.test.ts (EZD-009 T18); next/headers is
// mocked with an empty cookie store as in app/src/app/api/jobs/[id]/route.test.ts. 401 body: EZD-007c
// requireApiSession (docs/architecture.md Auth and session).
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as complete } from './[id]/complete/route';
import { POST as start } from './route';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
  headers: async () => new Headers(),
}));

const NOT_SIGNED_IN_BODY = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };

const startRequest = () =>
  new Request('http://localhost/api/dev/storage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: randomUUID(),
      kind: 'pdf',
      originalName: 'plan.pdf',
      contentType: 'application/pdf',
      size: 7340155,
    }),
  });

const completeCall = () => {
  const id = randomUUID();
  return complete(
    new Request(`http://localhost/api/dev/storage/${id}/complete`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  );
};

describe('EZD-132 dev storage routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-132 T18 both dev storage routes are 404 in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await start(startRequest())).status).toBe(404);
    expect((await completeCall()).status).toBe(404);
  });

  it('EZD-132 T18 both dev storage routes answer 401 not_signed_in with no session', async () => {
    const s = await start(startRequest());
    expect(s.status).toBe(401);
    expect(await s.json()).toEqual(NOT_SIGNED_IN_BODY);
    const c = await completeCall();
    expect(c.status).toBe(401);
    expect(await c.json()).toEqual(NOT_SIGNED_IN_BODY);
  });
});
