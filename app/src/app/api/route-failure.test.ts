// EZD-169 (vault/plans/EZD-169.md sections 3-4; Q-0268; Q-0317 (a); Q-0318 (a)): every route catch that
// answers 500 db_unavailable reports the error once, with the route pattern as location and the caught
// error's name as cause, and still answers the same 500. Expected values come from the plan: the 500 body
// (section 3, Q-0168 (b)), the fingerprint (section 3, fingerprint.ts), the route patterns (section 3).
// Unit tests against the local database and the stub Sentry transport (CLAUDE.md rule 6; no live service).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { PermissionKey } from '../../lib/permissions/catalog';
import type { PermissionContext } from '../../server/permissions/context';
import { errorFingerprint } from '../../server/errors/fingerprint';
import { initErrorReporting } from '../../server/errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../../server/errors/test-harness/sentry-stub-transport';
import { JobError } from '../../server/jobs';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { eventsIn } from '../../../test-harness/sentry-outbox';
import { adminDb, closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';
import { GET as readJob } from './jobs/[id]/route';
import { POST as devEnqueue } from './dev/jobs/route';
import { GET as realtimeToken } from './realtime/token/route';
import { GET as health } from './health/route';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  afterTasks: [] as Array<() => unknown>,
  requireApiSession: async (): Promise<unknown> => null,
  getPermissionContext: async (): Promise<unknown> => null,
  enqueueJob: async (..._args: unknown[]): Promise<unknown> => null,
  readHealth: async (): Promise<unknown> => null,
}));

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

vi.mock('../../server/auth/session', () => ({
  requireApiSession: () => state.requireApiSession(),
  getSession: async () => null,
  requireSession: async () => {
    throw new Error('requireSession is not used by these routes');
  },
}));

// requireApiPermission (can.ts) reads its context through ./context. The real 401 and 403 order runs; only
// the context is granted here (EZD-169 section 4). importOriginal keeps the other exports of index.ts.
vi.mock('../../server/permissions/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/permissions/context')>()),
  getPermissionContext: () => state.getPermissionContext(),
}));

vi.mock('../../server/jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/jobs')>()),
  enqueueJob: (...a: unknown[]) => state.enqueueJob(...a),
}));

vi.mock('../../server/db/health', () => ({
  readHealth: () => state.readHealth(),
}));

// Only the health route calls after(). The real after() throws outside a request scope (Q-0317 (a)), so
// the mock keeps the task and T5 runs it under the test's control.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: unknown) => {
    state.afterTasks.push(task as () => unknown);
  },
}));

const ROUTE_JOB = '/api/jobs/[id]';
const ROUTE_DEV = '/api/dev/jobs';
const ROUTE_TOKEN = '/api/realtime/token';
const ROUTE_HEALTH = '/api/health';

const DB_UNAVAILABLE_BODY = {
  error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
};
const JOB_NOT_FOUND_BODY = { error: { code: 'job_not_found', message_key: 'error.job_not_found' } };
const INVALID_INPUT_BODY = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };
const PERMISSION_DENIED_BODY = {
  error: { code: 'permission_denied', message_key: 'error.not_authorized' },
};

const DEV_BODY = { projectId: '33333333-3333-4333-8333-333333333333', steps: 1, stepMs: 0 };

const probe = () => Object.assign(new Error('ezd169-probe-detail'), { name: 'ProbeDbError' });

const FAKE_SESSION = {
  authUserId: randomUUID(),
  appUserId: randomUUID(),
  email: 'ezd169@example.test',
};

const FAKE_CTX: PermissionContext = {
  appUserId: FAKE_SESSION.appUserId,
  membershipId: randomUUID(),
  scope: 'all',
  permissions: new Set<PermissionKey>(['view_projects', 'edit_model']),
  listedProjectIds: new Set<string>(),
};

let releaseLock: () => Promise<void> = async () => {};

beforeAll(async () => {
  releaseLock = await holdErrorAlertLock();
  await harnessSql()`delete from public.error_alert`;
  initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
}, 180000);

beforeEach(async () => {
  clearSentryStubOutbox();
  await harnessSql()`delete from public.error_alert`;
  state.afterTasks = [];
  state.requireApiSession = async () => FAKE_SESSION;
  state.getPermissionContext = async () => FAKE_CTX;
  state.enqueueJob = async () => ({ id: randomUUID(), status: 'queued' });
  state.readHealth = async () => ({ status: 'ok', schema_version: '00000000000000' });
  vi.stubEnv('VERCEL_ENV', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
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

function devPost(): Promise<Response> {
  return devEnqueue(
    new Request('http://localhost/api/dev/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(DEV_BODY),
    }),
  );
}

function readOneJob(id: string): Promise<Response> {
  return readJob(new Request(`http://localhost/api/jobs/${id}`), {
    params: Promise.resolve({ id }),
  });
}

async function expectBody(res: Response, status: number, body: unknown) {
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toContain('no-store');
  const text = await res.text();
  expect(text).not.toContain('ezd169-probe-detail');
  expect(JSON.parse(text)).toEqual(body);
}

// The report of one failed request: one stub event, and one error_alert row for its fingerprint.
async function expectReportedOnce(route: string) {
  await Sentry.flush(2000);
  const events = eventsIn(readSentryStubOutbox());
  expect(events).toHaveLength(1);
  const event = events[0];
  expect(event.exception.values[0].type).toBe('Error');
  expect(event.exception.values[0].value).toBe('db_unavailable');
  expect(event.tags['ezd.source']).toBe('function');
  expect(event.tags['ezd.location']).toBe(route);
  expect(event.tags['ezd.cause']).toBe('ProbeDbError');
  expect(JSON.stringify(event)).not.toContain('ezd169-probe-detail');

  const { data, error } = await adminDb()
    .from('error_alert')
    .select('kind, source, title, fingerprint, ref, occurrences');
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(data?.[0]).toEqual({
    kind: 'error',
    source: 'function',
    title: 'Error: db_unavailable',
    fingerprint: await errorFingerprint({
      source: 'function',
      type: 'Error',
      message: 'db_unavailable',
      location: route,
    }),
    ref: event.event_id,
    occurrences: 1,
  });
}

// Nothing reported: no stub event and no error_alert row.
async function expectNothingReported() {
  await Sentry.flush(2000);
  expect(eventsIn(readSentryStubOutbox())).toHaveLength(0);
  const { data, error } = await adminDb().from('error_alert').select('kind');
  expect(error).toBeNull();
  expect(data).toHaveLength(0);
}

describe('EZD-169 route 500s report the error', () => {
  it('EZD-169 T1 job read route reports a failed session read once and answers db_unavailable', async () => {
    state.requireApiSession = async () => {
      throw probe();
    };
    const res = await readOneJob(randomUUID());
    await expectBody(res, 500, DB_UNAVAILABLE_BODY);
    await expectReportedOnce(ROUTE_JOB);
  });

  it('EZD-169 T2 dev enqueue route reports a failed session read once', async () => {
    state.requireApiSession = async () => {
      throw probe();
    };
    const res = await devPost();
    await expectBody(res, 500, DB_UNAVAILABLE_BODY);
    await expectReportedOnce(ROUTE_DEV);
  });

  it('EZD-169 T3 dev enqueue route reports a failed enqueue once', async () => {
    state.enqueueJob = async () => {
      throw probe();
    };
    const res = await devPost();
    await expectBody(res, 500, DB_UNAVAILABLE_BODY);
    await expectReportedOnce(ROUTE_DEV);
  });

  it('EZD-169 T4 realtime token route reports a failed session read once', async () => {
    state.requireApiSession = async () => {
      throw probe();
    };
    const res = await realtimeToken();
    await expectBody(res, 500, DB_UNAVAILABLE_BODY);
    await expectReportedOnce(ROUTE_TOKEN);
  });

  it('EZD-169 T5 health route reports a failed database read once', async () => {
    state.readHealth = async () => {
      throw probe();
    };
    const res = await health();
    // The answer does not wait for the report (Q-0317 (a)): the report is one task after() took.
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(JSON.parse(await res.text())).toEqual(DB_UNAVAILABLE_BODY);
    expect(state.afterTasks).toHaveLength(1);
    await Promise.all(state.afterTasks.splice(0).map((task) => task()));
    await expectReportedOnce(ROUTE_HEALTH);
  });

  it('EZD-169 T6 answers that are not 500 report nothing', async () => {
    // (i) the 42501 branch of the enqueue catch answers 404 job_not_found and reports nothing.
    state.enqueueJob = async () => {
      throw Object.assign(new Error('x'), { code: '42501' });
    };
    await expectBody(await devPost(), 404, JOB_NOT_FOUND_BODY);
    await expectNothingReported();

    // (ii) the invalid_payload branch answers 400 invalid_input and reports nothing.
    state.enqueueJob = async () => {
      throw new JobError('invalid_payload', { retry: false });
    };
    await expectBody(await devPost(), 400, INVALID_INPUT_BODY);
    await expectNothingReported();

    // (iii) a job id that is not a UUID answers 404 job_not_found and reports nothing.
    await expectBody(await readOneJob('not-a-uuid'), 404, JOB_NOT_FOUND_BODY);
    await expectNothingReported();

    // (iv) no permission context answers 403 permission_denied and reports nothing.
    state.getPermissionContext = async () => null;
    await expectBody(await readOneJob(randomUUID()), 403, PERMISSION_DENIED_BODY);
    await expectNothingReported();
  });

  it('EZD-169 T7 every route file that answers 500 reports the error', () => {
    const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const routeFiles = readdirSync(appDir, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => path.basename(entry) === 'route.ts')
      .sort();
    expect(routeFiles.length).toBeGreaterThan(0);

    const textOf = (file: string) => readFileSync(path.join(appDir, file), 'utf8');
    const answers500 = routeFiles.filter((file) => textOf(file).includes('status: 500'));

    // (a) the scan finds the four routes of section 1, so it is not empty.
    const section1 = [
      'api/jobs/[id]/route.ts',
      'api/dev/jobs/route.ts',
      'api/realtime/token/route.ts',
      'api/health/route.ts',
    ];
    expect(answers500).toEqual(expect.arrayContaining(section1));

    // (b) each route that answers 500 reports: reportRouteFailure( (the four of section 1) or
    // reportError( (the two EZD-102 permission routes, which already report, section 4 T7 (b)).
    for (const file of answers500) {
      expect(textOf(file), file).toMatch(/reportRouteFailure\(|reportError\(/);
    }

    // (c) the section 1 routes call reportRouteFailure once per catch: dev/jobs has two, the others one.
    const calls = (file: string) => textOf(file).split('reportRouteFailure(').length - 1;
    expect(calls('api/dev/jobs/route.ts')).toBe(2);
    for (const file of section1.filter((f) => f !== 'api/dev/jobs/route.ts')) {
      expect(calls(file), file).toBe(1);
    }
  });
});
