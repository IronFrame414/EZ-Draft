// EZD-5601 T18 (vault/plans/EZD-5601.md section 1 step 17 and "D-Rewrap", section 4; AC-EZD-5601-10): the
// sweep calls the key rewrap once after the job run and still answers 200 when the rewrap fails, reporting
// ai_key_rewrap_failed by code. The runner, the rewrap and the report are mocked; the sweep's auth and
// response are as EZD-009 Step 6 (401 not_authorized without the Bearer secret, `{ ran }` otherwise).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '../../../../server/errors/report';
import { rewrapStaleAiKeys } from '../../../../server/jobs/ai-key-rewrap';
import { runJobs } from '../../../../server/jobs/runner';

const order = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('../../../../server/jobs/runner', () => ({
  runJobs: vi.fn(async () => {
    order.calls.push('runJobs');
    return { claimed: 3 };
  }),
}));
vi.mock('../../../../server/jobs/ai-key-rewrap', () => ({
  rewrapStaleAiKeys: vi.fn(async () => {
    order.calls.push('rewrap');
    return { rewrapped: 0, failed: 0 };
  }),
}));
vi.mock('../../../../server/errors/report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/errors/report')>();
  return { ...actual, reportError: vi.fn(async () => ({})) };
});

const SECRET = 'ezd5601-sweep-secret';
const call = async (authorization?: string) => {
  const { GET } = await import('./route');
  return GET(
    new Request('http://localhost/api/jobs/sweep', {
      headers: authorization === undefined ? {} : { authorization },
    }),
  );
};

describe('EZD-5601 sweep rewrap', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
    order.calls.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(runJobs).mockClear();
    vi.mocked(rewrapStaleAiKeys).mockClear();
    vi.mocked(reportError).mockClear();
  });

  it('T18 calls the rewrap once after runJobs and answers { ran }', async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: 3 });
    expect(rewrapStaleAiKeys).toHaveBeenCalledTimes(1);
    expect(order.calls).toEqual(['runJobs', 'rewrap']);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('T18 a failing rewrap is reported by code and the sweep still answers 200', async () => {
    vi.mocked(rewrapStaleAiKeys).mockRejectedValueOnce(new Error('secret detail'));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: 3 });
    expect(reportError).toHaveBeenCalledTimes(1);
    const [error, context] = vi.mocked(reportError).mock.calls[0];
    expect((error as Error).message).toBe('ai_key_rewrap_failed');
    expect(context).toEqual({ source: 'job', location: '/api/jobs/sweep' });
  });

  it('T18 without the Bearer secret: 401 and the rewrap is not called', async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(rewrapStaleAiKeys).not.toHaveBeenCalled();
  });
});
