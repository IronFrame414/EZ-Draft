// EZD-009 T18, route part (vault/plans/EZD-009.md Tests; Step 6): POST /api/dev/jobs answers 404 in
// production (EZD-010 Step 5 rule), before any session or body work.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

describe('EZD-009 dev enqueue route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-009 T18 the dev enqueue route is 404 in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const res = await POST(
      new Request('http://localhost/api/dev/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: '33333333-3333-4333-8333-333333333333',
          steps: 1,
          stepMs: 0,
        }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
