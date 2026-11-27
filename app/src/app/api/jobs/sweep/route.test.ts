// EZD-5601 T18 (vault/plans/EZD-5601.md section 1 step 17 and "D-Rewrap", section 4; AC-EZD-5601-10): the
// sweep calls the key rewrap once after the job run and still answers 200 when the rewrap fails, reporting
// ai_key_rewrap_failed by code. The runner, the rewrap and the report are mocked; the sweep's auth and
// response are as EZD-009 Step 6 (401 not_authorized without the Bearer secret, `{ ran }` otherwise).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '../../../../server/errors/report';
import { rewrapStaleAiKeys } from '../../../../server/jobs/ai-key-rewrap';
import { runJobs } from '../../../../server/jobs/runner';
import { sweepTunnelAlertDigest } from '../../../../server/jobs/tunnel-alert-digest';
import { sweepExpiredLocks } from '../../../../server/lock/sweep';
import { sweepVersionCleanup } from '../../../../server/versions/cleanup-sweep';

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
// EZD-125: the edit lock pass, mocked so these rows never reach a database.
vi.mock('../../../../server/lock/sweep', () => ({
  sweepExpiredLocks: vi.fn(async () => 0),
}));
// EZD-123: the daily version cleanup pass, mocked so these rows never reach a database.
vi.mock('../../../../server/versions/cleanup-sweep', () => ({
  sweepVersionCleanup: vi.fn(async () => 0),
}));
// EZD-2020: the tunnel alert digest pass, mocked so these rows never reach a database.
vi.mock('../../../../server/jobs/tunnel-alert-digest', () => ({
  sweepTunnelAlertDigest: vi.fn(async () => ({ status: 'none', count: 0 })),
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

describe('EZD-125 sweep edit lock pass', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(sweepExpiredLocks).mockClear();
    vi.mocked(reportError).mockClear();
  });

  it('AC-EZD-125-7 every sweep runs one edit lock pass and answers { ran }', async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: 3 });
    expect(sweepExpiredLocks).toHaveBeenCalledTimes(1);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('AC-EZD-125-7 a failing pass is reported as edit_lock_sweep_failed and the sweep still answers 200', async () => {
    vi.mocked(sweepExpiredLocks).mockRejectedValueOnce(new Error('secret detail'));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(reportError).toHaveBeenCalledTimes(1);
    const [error, context] = vi.mocked(reportError).mock.calls[0];
    expect((error as Error).message).toBe('edit_lock_sweep_failed');
    expect(context).toEqual({ source: 'job', location: '/api/jobs/sweep' });
  });

  it('AC-EZD-125-7 without the Bearer secret the pass does not run', async () => {
    expect((await call()).status).toBe(401);
    expect(sweepExpiredLocks).not.toHaveBeenCalled();
  });
});

describe('EZD-123 sweep version cleanup pass', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(sweepVersionCleanup).mockClear();
    vi.mocked(runJobs).mockClear();
    vi.mocked(reportError).mockClear();
  });

  it("AC-EZD-123-3 every sweep queues the day's cleanup jobs before the job run and answers { ran }", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: 3 });
    expect(sweepVersionCleanup).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sweepVersionCleanup).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runJobs).mock.invocationCallOrder[0],
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it('AC-EZD-123-3 a failing pass is reported as version_cleanup_enqueue_failed and the sweep still answers 200', async () => {
    vi.mocked(sweepVersionCleanup).mockRejectedValueOnce(new Error('secret detail'));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: 3 });
    expect(reportError).toHaveBeenCalledTimes(1);
    const [error, context] = vi.mocked(reportError).mock.calls[0];
    expect((error as Error).message).toBe('version_cleanup_enqueue_failed');
    expect(context).toEqual({ source: 'job', location: '/api/jobs/sweep' });
  });

  it('AC-EZD-123-3 without the Bearer secret the pass does not run', async () => {
    expect((await call()).status).toBe(401);
    expect(sweepVersionCleanup).not.toHaveBeenCalled();
  });
});

describe('EZD-2020 sweep tunnel alert digest pass', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(sweepTunnelAlertDigest).mockClear();
    vi.mocked(reportError).mockClear();
  });

  it('AC-EZD-2020-1 every sweep runs one digest pass and answers { ran }', async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: 3 });
    expect(sweepTunnelAlertDigest).toHaveBeenCalledTimes(1);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('AC-EZD-2020-1 a failing pass is reported as tunnel_alert_digest_failed and the sweep still answers 200', async () => {
    vi.mocked(sweepTunnelAlertDigest).mockRejectedValueOnce(new Error('secret detail'));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ran: 3 });
    expect(reportError).toHaveBeenCalledTimes(1);
    const [error, context] = vi.mocked(reportError).mock.calls[0];
    expect((error as Error).message).toBe('tunnel_alert_digest_failed');
    expect(context).toEqual({ source: 'job', location: '/api/jobs/sweep' });
  });

  it('AC-EZD-2020-1 without the Bearer secret the pass does not run', async () => {
    expect((await call()).status).toBe(401);
    expect(sweepTunnelAlertDigest).not.toHaveBeenCalled();
  });
});
