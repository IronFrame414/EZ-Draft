// EZD-150 T1-T5 (vault/plans/EZD-150.md section 4). Unit tests: fake setTimeout/clearTimeout and a stubbed
// global fetch, so nothing reaches a network (CLAUDE.md rule 6). Env comes from the global setup (EZD-004b).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_DB_TIMEOUT_MS } from '../../../server/db/health';
import { GET } from './route';

const DB_UNAVAILABLE = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };

async function expectUnavailable(res: Response) {
  expect(res.status).toBe(500);
  expect(res.headers.get('cache-control')).toContain('no-store');
  expect(await res.json()).toEqual(DB_UNAVAILABLE);
}

// A fetch that never answers but honours the abort signal (rejects with the signal's reason when aborted).
function stalledFetch() {
  return vi.fn<typeof fetch>(
    (...args) =>
      new Promise<Response>((_, reject) => {
        const signal = args[1]?.signal;
        signal?.addEventListener('abort', () => reject(signal.reason));
      }),
  );
}

// A fetch that never answers and ignores the abort signal.
function deadFetch() {
  return vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
}

// Calls GET() and records whether its promise has settled.
function startGet() {
  const state = { settled: false };
  const p = GET();
  p.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    },
  );
  return { p, state };
}

function initOfFirstCall(fetchMock: { mock: { calls: unknown[][] } }): RequestInit | undefined {
  return fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
}

describe('EZD-150 health check timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('EZD-150 T1 stalled fetch answers the failure at the time limit, done when', async () => {
    const fetchMock = stalledFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { p, state } = startGet();
    await vi.advanceTimersByTimeAsync(HEALTH_DB_TIMEOUT_MS - 1);
    expect(state.settled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(initOfFirstCall(fetchMock)?.signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
    await expectUnavailable(await p);
    expect(initOfFirstCall(fetchMock)?.signal?.aborted).toBe(true);
  });

  it('EZD-150 T2 fetch that ignores the signal still gives up at the time limit', async () => {
    const fetchMock = deadFetch();
    vi.stubGlobal('fetch', fetchMock);

    const { p, state } = startGet();
    await vi.advanceTimersByTimeAsync(HEALTH_DB_TIMEOUT_MS - 1);
    expect(state.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
    await expectUnavailable(await p);
  });

  it('EZD-150 T3 a prompt answer is unchanged and the timer is cleared', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ status: 'ok', schema_version: '20260101000000' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { p } = startGet();
    await vi.advanceTimersByTimeAsync(0);
    const res = await p;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = initOfFirstCall(fetchMock);
    expect(init?.signal).toBeDefined();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', schema_version: '20260101000000' });

    await vi.advanceTimersByTimeAsync(HEALTH_DB_TIMEOUT_MS);
    expect(init?.signal?.aborted).toBe(false);
  });

  it('EZD-150 T4 a failing fetch answers at once and clears the timer', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    vi.stubGlobal('fetch', fetchMock);

    const { p } = startGet();
    await vi.advanceTimersByTimeAsync(0);
    const res = await p;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = initOfFirstCall(fetchMock);
    expect(init?.signal).toBeDefined();
    await expectUnavailable(res);

    await vi.advanceTimersByTimeAsync(HEALTH_DB_TIMEOUT_MS);
    expect(init?.signal?.aborted).toBe(false);
  });

  it('EZD-150 T5 time limit value', () => {
    expect(HEALTH_DB_TIMEOUT_MS).toBe(3000);
    expect(HEALTH_DB_TIMEOUT_MS).toBeLessThan(4000);
  });
});
