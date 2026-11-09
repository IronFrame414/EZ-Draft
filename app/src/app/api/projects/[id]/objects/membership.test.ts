// EZD-120d R1 membership (vault/plans/EZD-120d.md section 4; AC-EZD-120d-3; Decided "Membership check"): a
// save whose `x-ezdraft-membership` header is missing, or is not the session's membership, is a 401
// `not_signed_in` and writes nothing; the session's own membership id saves (200). Same sign-in and mocks as
// route.test.ts beside it.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../../../test-harness/errors/alert-lock';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import { APP_BUILD_HEADER, appBuild } from '../../../../../lib/app-version';
import { emit } from '../../../../../server/events';

vi.mock('../../../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});
const emitMock = vi.mocked(emit);

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

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };

describe('EZD-120d save route membership check', () => {
  let tenant = '';
  let project = '';
  let floorId = '';
  let editor: Member;
  let other: Member;
  let editorCookies: Map<string, string>;
  let releaseLock: () => Promise<void>;

  const wall = (id: string) => ({
    id,
    baseSeq: 0,
    deleted: false,
    type: 'wall',
    schemaVersion: 1,
    data: {
      geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
      status: 'new',
      level: floorId,
      attributes: {
        thickness: 4.5,
        thicknessSide: 'right',
        height: 96,
        topCutToCeiling: false,
        bearing: false,
      },
    },
  });
  const post = async (changeId: string, header?: string) => {
    const { POST } = await import('./route');
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [APP_BUILD_HEADER]: String(appBuild()),
          ...(header === undefined ? {} : { 'x-ezdraft-membership': header }),
        },
        body: JSON.stringify({ lockEpoch: 0, changes: [wall(changeId)] }),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    return { res, json: JSON.parse(await res.text()) as unknown };
  };
  const stored = async (id: string) =>
    harnessSql()`select 1 from public.model_object
      where project_id = ${project}::uuid and object_id = ${id}::uuid`;

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    other = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, other.membershipId, ['view_projects', 'edit_model']);
    floorId = (
      await harnessSql()<{ object_id: string }[]>`
        select object_id from public.model_object
        where project_id = ${project}::uuid and type = 'floor'`
    )[0].object_id;
    editorCookies = await cookiesFor(editor.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    emitMock.mockClear();
  });

  afterAll(async () => {
    try {
      await cleanup();
      await closeHarness();
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('R1 membership: no header and another member id are 401 not_signed_in with no row; the own id saves', async () => {
    const missing = randomUUID();
    state.store = new Map(editorCookies);
    const a = await post(missing);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);
    expect(a.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(await stored(missing)).toHaveLength(0);

    const wrong = randomUUID();
    state.store = new Map(editorCookies);
    const b = await post(wrong, other.membershipId);
    expect(b.res.status).toBe(401);
    expect(b.json).toEqual(NOT_SIGNED_IN);
    expect(await stored(wrong)).toHaveLength(0);
    expect(emitMock).not.toHaveBeenCalled();

    const own = randomUUID();
    state.store = new Map(editorCookies);
    const c = await post(own, editor.membershipId);
    expect(c.res.status).toBe(200);
    expect(c.json).toEqual({ objects: [{ id: own, updatedSeq: 1 }] });
    expect(await stored(own)).toHaveLength(1);
  }, 120000);
});
