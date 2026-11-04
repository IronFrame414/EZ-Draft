// EZD-181 (vault/plans/EZD-181.md sections 3-4; AC-EZD-181-1; EZD-150 section 3; EZD-169 sections 3-4;
// Q-0285 (a); Q-0317 (a)). A timed-out health read answers its 500 at the 3-second limit, and the report of
// that failure still reaches Sentry and error_alert: in-scope request (T1, T2) and outside a request scope
// (T3). Unit tests against the local database and the stub Sentry transport (CLAUDE.md rule 6; no live service).
// EZD-251 (vault/plans/EZD-251.md sections 1, 3, 4; AC-EZD-251-1, AC-EZD-251-2; Q-0356 (a); Q-0381 (a)): the
// alert store is shared by every test file, so the rows and the store requests are scoped to this test's
// fingerprint and fetch stub, and each test waits for its own store request instead of a fixed window.
import * as Sentry from '@sentry/nextjs';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { HEALTH_DB_TIMEOUT_MS } from '../../../server/db/health';
import { errorFingerprint } from '../../../server/errors/fingerprint';
import { initErrorReporting } from '../../../server/errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../../../server/errors/test-harness/sentry-stub-transport';
import { holdErrorAlertLock } from '../../../../test-harness/errors/alert-lock';
import { eventsIn } from '../../../../test-harness/sentry-outbox';
import { adminDb, closeHarness, harnessSql } from '../../../../test-harness/rls/fixtures';
import { GET } from './route';

// EZD-169 section 4 pattern (app/src/app/api/monitoring/route.test.ts lines 20-25): the 500 path calls
// after(report) once. state.afterThrows makes after() throw as it does outside a request scope (Q-0317 (a)).
const state = vi.hoisted(() => ({
  tasks: [] as Array<() => unknown>,
  afterThrows: false,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: unknown) => {
    if (state.afterThrows) throw new Error('`after` was called outside a request scope.');
    state.tasks.push(task as () => unknown);
  },
}));

const DB_UNAVAILABLE = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };
const realFetch = globalThis.fetch;

function isHealthRpc(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(url).pathname === '/rest/v1/rpc/health';
}

// The report's store call (supabase-js rpc path, report.ts line 69).
function isStoreRpc(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(url).pathname === '/rest/v1/rpc/record_error_alert';
}

// The health RPC never answers but honours its abort signal. The first store call goes to the local database,
// and storeAnswered resolves when that call settles (fulfilled or rejected). Every other request goes to the
// local database too.
function stalledHealthFetch(): { fetch: Mock<typeof fetch>; storeAnswered: Promise<void> } {
  let resolveStore!: () => void;
  const storeAnswered = new Promise<void>((resolve) => {
    resolveStore = resolve;
  });
  let storeSeen = false;
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    if (isStoreRpc(input)) {
      const answer = realFetch(input, init);
      if (!storeSeen) {
        storeSeen = true;
        answer.then(resolveStore, resolveStore);
      }
      return answer;
    }
    if (!isHealthRpc(input)) return realFetch(input, init);
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
  });
  return { fetch: fetchMock, storeAnswered };
}

// Every request never answers, so nothing reaches the local database. storeCalled resolves when the first store
// call arrives.
function hungDatabaseFetch(): { fetch: Mock<typeof fetch>; storeCalled: Promise<void> } {
  let resolveStored!: () => void;
  const storeCalled = new Promise<void>((resolve) => {
    resolveStored = resolve;
  });
  const fetchMock = vi.fn<typeof fetch>((input) => {
    if (isStoreRpc(input)) resolveStored();
    return new Promise<Response>(() => {});
  });
  return { fetch: fetchMock, storeCalled };
}

// The number of store calls that one test's fetch stub received.
function storeRpcCalls(fetchMock: Mock<typeof fetch>): number {
  return fetchMock.mock.calls.filter(([input]) => isStoreRpc(input)).length;
}

async function expectUnavailable(res: Response) {
  expect(res.status).toBe(500);
  expect(res.headers.get('cache-control')).toContain('no-store');
  expect(await res.json()).toEqual(DB_UNAVAILABLE);
}

// "Reported": one stub event with the section 3 values. The message 'health rpc timeout' never leaves.
function expectReported() {
  const events = eventsIn(readSentryStubOutbox());
  expect(events).toHaveLength(1);
  const event = events[0];
  expect(event.exception.values[0].type).toBe('Error');
  expect(event.exception.values[0].value).toBe('db_unavailable');
  expect(event.tags['ezd.source']).toBe('function');
  expect(event.tags['ezd.location']).toBe('/api/health');
  expect(event.tags['ezd.cause']).toBe('Error');
  expect(JSON.stringify(event)).not.toContain('health rpc');
  return event;
}

function healthFingerprint(): Promise<string> {
  return errorFingerprint({
    source: 'function',
    type: 'Error',
    message: 'db_unavailable',
    location: '/api/health',
  });
}

// The rows of this test's own fingerprint; other files' rows are not counted (Q-0356 (a)).
async function alertRows() {
  const { data, error } = await adminDb()
    .from('error_alert')
    .select('kind, source, title, fingerprint, ref, occurrences')
    .eq('fingerprint', await healthFingerprint());
  return { data, error };
}

async function expectOneAlertRow(eventId: string) {
  const { data, error } = await alertRows();
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(data?.[0]).toEqual({
    kind: 'error',
    source: 'function',
    title: 'Error: db_unavailable',
    fingerprint: await healthFingerprint(),
    ref: eventId,
    occurrences: 1,
  });
}

let releaseLock: () => Promise<void> = async () => {};

beforeAll(async () => {
  releaseLock = await holdErrorAlertLock();
  await harnessSql()`delete from public.error_alert`;
  initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
}, 180000);

beforeEach(async () => {
  clearSentryStubOutbox();
  await harnessSql()`delete from public.error_alert`;
  state.tasks = [];
  state.afterThrows = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  try {
    await harnessSql()`delete from public.error_alert`;
    await closeHarness();
    await Sentry.close(2000);
  } finally {
    await releaseLock();
  }
}, 180000);

describe('EZD-181 health timeout reports the error', () => {
  it('EZD-181 T1 a timed-out health read answers db_unavailable and reports once, done when', async () => {
    const stub = stalledHealthFetch();
    vi.stubGlobal('fetch', stub.fetch);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const progress = { settled: false };
    const p = GET();
    p.then(
      () => {
        progress.settled = true;
      },
      () => {
        progress.settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(HEALTH_DB_TIMEOUT_MS - 1);
    expect(progress.settled).toBe(false);
    expect(state.tasks).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(progress.settled).toBe(true);
    expect(state.tasks).toHaveLength(1);

    vi.useRealTimers();
    const res = await p;
    await expectUnavailable(res);

    await state.tasks[0]();
    expect(await Sentry.flush(2000)).toBe(true);
    const event = expectReported();
    await expectOneAlertRow(event.event_id);
    expect(storeRpcCalls(stub.fetch)).toBe(1);
  });

  it('EZD-181 T2 a hung database still gets its 500 at the limit and the Sentry event', async () => {
    const stub = hungDatabaseFetch();
    vi.stubGlobal('fetch', stub.fetch);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const progress = { settled: false };
    const p = GET();
    p.then(
      () => {
        progress.settled = true;
      },
      () => {
        progress.settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(HEALTH_DB_TIMEOUT_MS - 1);
    expect(progress.settled).toBe(false);
    expect(state.tasks).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(progress.settled).toBe(true);
    expect(state.tasks).toHaveLength(1);

    vi.useRealTimers();
    const res = await p;
    await expectUnavailable(res);

    // The store call never answers, so the task is not awaited. Waiting for the call to reach the stub keeps
    // it on this test's fetch stub; it can never reach the database after this test ends.
    void state.tasks[0]();
    await stub.storeCalled;
    expect(await Sentry.flush(2000)).toBe(true);
    expectReported();
    expect(storeRpcCalls(stub.fetch)).toBe(1);

    vi.unstubAllGlobals();
    const { data, error } = await alertRows();
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('EZD-181 T3 outside a request scope the report still starts and the answer is unchanged', async () => {
    state.afterThrows = true;
    const stub = stalledHealthFetch();
    vi.stubGlobal('fetch', stub.fetch);

    const res = await GET();
    await expectUnavailable(res);

    expect(await Sentry.flush(2000)).toBe(true);
    const event = expectReported();

    // The report's store call settles when the database answers it; no fixed window is needed.
    await stub.storeAnswered;
    await expectOneAlertRow(event.event_id);
    expect(storeRpcCalls(stub.fetch)).toBe(1);
  }, 20000);
});
