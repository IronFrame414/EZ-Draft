// EZD-128 R3 (vault/plans/EZD-128.md section 4; AC-EZD-128-4). Only `listRecentProjects` is mocked (it throws);
// the session, the permission check and the report are real. Expected values: EZD-169 (a route catch answers 500
// `db_unavailable`, reports once with the route pattern as location and the caught error's name as cause,
// never its message). Pattern: app/src/app/api/projects/[id]/model/route-failure.test.ts.
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../../test-harness/errors/alert-lock';
import { expectReportedOnce } from '../../../../../test-harness/errors/expect-reported';
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
import { initErrorReporting } from '../../../../server/errors/sentry-options';
import { clearSentryStubOutbox } from '../../../../server/errors/test-harness/sentry-stub-transport';

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

const DB_UNAVAILABLE = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };
const MOCKED = '../../../../server/projects/recent';

describe('EZD-128 recent projects route failure', () => {
  let memberCookies: Map<string, string>;
  let releaseLock: () => Promise<void> = async () => {};

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    memberCookies = await cookiesFor(member.email);
  }, 180000);

  beforeEach(async () => {
    clearSentryStubOutbox();
    await harnessSql()`delete from public.error_alert`;
  });

  afterEach(() => {
    state.store = new Map();
    vi.doUnmock(MOCKED);
    vi.resetModules();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await cleanup();
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('R3 answers 500 db_unavailable and reports once when the list read throws', async () => {
    vi.doMock(MOCKED, async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../../../server/projects/recent')>()),
      listRecentProjects: async () => {
        throw new Error('ezd128-boom-secret');
      },
    }));
    state.store = new Map(memberCookies);
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost/api/projects/recent'));
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const text = await res.text();
    expect(text).not.toContain('ezd128-boom-secret');
    expect(JSON.parse(text)).toEqual(DB_UNAVAILABLE);
    await expectReportedOnce({
      message: 'db_unavailable',
      location: '/api/projects/recent',
      cause: 'Error',
      hidden: 'ezd128-boom-secret',
    });
  }, 120000);
});
