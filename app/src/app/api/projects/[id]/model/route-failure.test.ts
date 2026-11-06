// EZD-120b R3 (vault/plans/EZD-120b.md section 4; AC-EZD-120b-5). Only `loadModel` is mocked (it throws); the
// session, the permission check and the report are real. Expected values: EZD-169 (a route catch answers 500
// `db_unavailable`, reports once with the route pattern as location and the caught error's name as cause,
// never its message). Pattern: app/src/app/api/settings/customers/route.test.ts and route-failure.test.ts.
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../../../test-harness/errors/alert-lock';
import { expectReportedOnce } from '../../../../../../test-harness/errors/expect-reported';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import { initErrorReporting } from '../../../../../server/errors/sentry-options';
import { clearSentryStubOutbox } from '../../../../../server/errors/test-harness/sentry-stub-transport';

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

describe('EZD-120b model load route failure', () => {
  let project = '';
  let editorCookies: Map<string, string>;
  let releaseLock: () => Promise<void> = async () => {};

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    editorCookies = await cookiesFor(editor.email);
  }, 180000);

  beforeEach(async () => {
    clearSentryStubOutbox();
    await harnessSql()`delete from public.error_alert`;
  });

  afterEach(() => {
    state.store = new Map();
    vi.doUnmock('../../../../../server/model/model');
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

  it('R3 answers 500 db_unavailable and reports once when loadModel throws', async () => {
    vi.doMock('../../../../../server/model/model', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../../../../server/model/model')>()),
      loadModel: async () => {
        throw Object.assign(new Error('ezd120b-probe-detail'), { name: 'ProbeDbError' });
      },
    }));
    state.store = new Map(editorCookies);
    const { GET } = await import('./route');
    const res = await GET(new Request(`http://localhost/api/projects/${project}/model`), {
      params: Promise.resolve({ id: project }),
    });
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const text = await res.text();
    expect(text).not.toContain('ezd120b-probe-detail');
    expect(JSON.parse(text)).toEqual(DB_UNAVAILABLE);
    await expectReportedOnce({
      message: 'db_unavailable',
      location: '/api/projects/[id]/model',
      cause: 'ProbeDbError',
      hidden: 'ezd120b-probe-detail',
    });
  }, 120000);
});
