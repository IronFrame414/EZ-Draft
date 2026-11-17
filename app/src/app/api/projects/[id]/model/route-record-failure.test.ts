// EZD-128 M2 (vault/plans/EZD-128.md section 4, Decided "Record at load"; AC-EZD-128-2). Only `recordProjectOpen`
// is mocked (it throws); the session, the permission check, `loadModel` and the report are real. Expected values:
// the load still answers 200 with the model (a recent list is not worth a failed open) and reports once
// `project_open_record_failed` with the route pattern as location and the caught error's name as cause, never its
// message (the objects route's EMIT_FAILED precedent). Pattern: route-failure.test.ts in this folder.
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

const MOCKED = '../../../../../server/projects/recent';

describe('EZD-128 model load record failure', () => {
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

  it('M2 answers 200 with the model and reports once when recording the open throws', async () => {
    vi.doMock(MOCKED, async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../../../../server/projects/recent')>()),
      recordProjectOpen: async () => {
        throw new Error('ezd128-boom-secret');
      },
    }));
    state.store = new Map(editorCookies);
    const { GET } = await import('./route');
    const res = await GET(new Request(`http://localhost/api/projects/${project}/model`), {
      params: Promise.resolve({ id: project }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('ezd128-boom-secret');
    expect((JSON.parse(text) as { project: { id: string } }).project.id).toBe(project);
    await expectReportedOnce({
      message: 'project_open_record_failed',
      location: '/api/projects/[id]/model',
      cause: 'Error',
      hidden: 'ezd128-boom-secret',
    });
    const rows = await harnessSql()<
      { n: number }[]
    >`select count(*)::int as n from public.project_recent
      where project_id = ${project}::uuid`;
    expect(rows[0].n).toBe(0);
  }, 120000);
});
