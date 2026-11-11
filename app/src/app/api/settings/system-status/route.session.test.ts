// EZD-135 R1, R2 (vault/plans/EZD-135.md section 4; AC-EZD-135-1, AC-EZD-135-2, AC-EZD-135-4; ticket Done when).
// Real sessions and the local stack; only reportRouteFailure is mocked (no error alert is stored). Pattern:
// app/src/app/api/benchmark/project/route.test.ts (state, next/headers mock, jarOver, cookiesFor).
// Expected values: Q-0664; Q-0225; can.ts lines 14-20; session.ts lines 36-45; Decided "Route order".
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));
const mocks = vi.hoisted(() => ({ reportRouteFailure: vi.fn(async () => {}) }));

vi.mock('../../../../server/errors/route-failure', () => ({
  reportRouteFailure: mocks.reportRouteFailure,
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

function jarOver(store: Map<string, string>): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const { error } = await createSessionClient(jarOver(store)).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}

const BASE = 'http://127.0.0.1:3000/api/settings/system-status';
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };

async function get(part: string): Promise<{ res: Response; json: Record<string, unknown> }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`${BASE}?part=${part}`));
  return { res, json: JSON.parse(await res.text()) as Record<string, unknown> };
}

describe('EZD-135 system status route (signed in)', () => {
  let releaseJobs: () => Promise<void>;
  let m1Cookies: Map<string, string>;
  let m2Cookies: Map<string, string>;
  let jobId: string;
  let backupId: string;

  beforeAll(async () => {
    releaseJobs = await holdJobQueueShared();
    const tenant = await createTenant();
    const m1 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m1.membershipId, ['settings_system_status']);
    const m2 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m2.membershipId, ['settings_libraries']);
    m1Cookies = await cookiesFor(m1.email);
    m2Cookies = await cookiesFor(m2.email);
    jobId = (
      await harnessSql()`insert into public.job (tenant_id, kind, status, attempts, max_attempts, error, finished_at) values (${tenant}::uuid, 'test', 'failed', 5, 5, 'ezd135_probe_failed', now()) returning id`
    )[0]!.id as string;
    backupId = (
      await harnessSql()`insert into public.backup_run (kind, scope, status, started_at, finished_at, bytes_copied) values ('files', 'all', 'succeeded', '2999-12-31T00:00:00Z', '2999-12-31T00:00:00Z', 7340032) returning id`
    )[0]!.id as string;
  }, 180000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.backup_run where id = ${backupId}`;
      await cleanup();
      await closeHarness();
    } finally {
      await releaseJobs();
    }
  }, 180000);

  it('R1 done when: the route returns a failed test job of the company and a stub backup record', async () => {
    state.store = new Map(m1Cookies);
    const a = await get('jobs');
    expect(a.res.status).toBe(200);
    expect(a.res.headers.get('Cache-Control')).toBe('no-store');
    expect(a.json).toMatchObject({ total: 1, page: 1, pageSize: 50 });
    const rows = a.json.rows as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      id: jobId,
      kind: 'test',
      error: 'ezd135_probe_failed',
      attempts: 5,
    });
    expect(typeof rows[0]!.finishedAt).toBe('string');

    const b = await get('backups');
    expect(b.res.status).toBe(200);
    expect(b.res.headers.get('Cache-Control')).toBe('no-store');
    expect(Object.keys(b.json)).toEqual(
      expect.arrayContaining(['files', 'dbDump', 'restoreDrill']),
    );
    expect(b.json.files).toEqual({
      finishedAt: '2999-12-31T00:00:00+00:00',
      bytesCopied: 7340032,
      location: null,
    });
  });

  it('R2 without the switch every part is 403; signed out is 401', async () => {
    state.store = new Map(m2Cookies);
    for (const part of ['jobs', 'webhooks', 'backups']) {
      const r = await get(part);
      expect(r.res.status, part).toBe(403);
      expect(r.json).toEqual(FORBIDDEN);
      expect(r.res.headers.get('Cache-Control')).toBe('no-store');
    }
    state.store = new Map();
    const out = await get('jobs');
    expect(out.res.status).toBe(401);
    expect(out.json).toEqual(NOT_SIGNED_IN);
    expect(out.res.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.reportRouteFailure).not.toHaveBeenCalled();
  });
});
