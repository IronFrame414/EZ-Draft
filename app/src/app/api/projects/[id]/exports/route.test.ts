// EZD-715: starting a PDF export queues one export job with the set and split asked for and answers 202 { jobId };
// without Export it is 403 and queues nothing; a bad body is 400 and a project RLS hides is 404. Mock pattern of the
// imports route tests (EZD-302).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../server/permissions', () => ({
  requireApiPermission: vi.fn(),
  requirePermission: vi.fn(() => null),
}));
const project = vi.fn();
vi.mock('../../../../../server/auth/supabase-server', () => ({
  createSessionClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: project }) }) }),
  }),
}));
vi.mock('../../../../../server/errors/route-failure', () => ({
  reportRouteFailure: vi.fn(async () => {}),
}));
vi.mock('../../../../../server/jobs/enqueue', () => ({
  enqueueJob: vi.fn(async () => ({ id: 'job-1' })),
}));

import { enqueueJob } from '../../../../../server/jobs/enqueue';
import { requireApiPermission } from '../../../../../server/permissions';
import { POST } from './route';

const P = '11111111-1111-4111-8111-111111111111';
const U = '55555555-5555-4555-8555-555555555555';

const call = (body: unknown, id = P) =>
  POST(
    new Request(`http://localhost/api/projects/${id}/exports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const signedIn = () =>
  vi.mocked(requireApiPermission).mockResolvedValueOnce({ session: { appUserId: U }, ctx: {} } as never);

describe('EZD-715 export route', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queues one export job for the permit set, one PDF per sheet when asked', async () => {
    signedIn();
    project.mockResolvedValueOnce({ data: { id: P }, error: null });
    const res = await call({ set: 'permit', split: 'sheet' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: 'job-1' });
    expect(requireApiPermission).toHaveBeenCalledWith('export');
    expect(enqueueJob).toHaveBeenCalledWith(expect.anything(), {
      kind: 'export',
      projectId: P,
      payload: { set: 'permit', split: 'sheet' },
    });
  });

  it('is 403 without Export and queues nothing', async () => {
    vi.mocked(requireApiPermission).mockResolvedValueOnce(
      Response.json({ error: { code: 'permission_denied' } }, { status: 403 }) as never,
    );
    expect((await call({ set: 'permit' })).status).toBe(403);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('is 400 for a set that does not exist or an unknown field', async () => {
    signedIn();
    expect((await call({ set: 'field' })).status).toBe(400);
    signedIn();
    expect((await call({ set: 'permit', password: 'x' })).status).toBe(400);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('is 404 for a malformed id or a project the caller cannot see', async () => {
    signedIn();
    expect((await call({ set: 'permit' }, 'nope')).status).toBe(404);
    signedIn();
    project.mockResolvedValueOnce({ data: null, error: null });
    expect((await call({ set: 'permit' })).status).toBe(404);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
