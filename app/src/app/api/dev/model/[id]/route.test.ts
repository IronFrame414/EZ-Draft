// EZD-120d R2 (vault/plans/EZD-120d.md sections 3 and 4; AC-EZD-120d-4, -5; Q-0505; Q-0508). Same sign-in and
// mocks as app/src/app/api/projects/[id]/checkpoints/route.test.ts. Expected values: the plan's interface
// contract row (200 `{ checkpoints: number }`, 401, 403, 404 `project_not_found`, production an empty 404) and
// the Decided "Dev route" order (production, session, project, permission).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';

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
const NOT_FOUND = { error: { code: 'project_not_found', message_key: 'error.project_not_found' } };

async function read(id: string): Promise<{ res: Response; text: string }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/dev/model/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { res, text: await res.text() };
}

async function checkpoint(id: string): Promise<number> {
  const { POST } = await import('../../../projects/[id]/checkpoints/route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/checkpoints`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  );
  return res.status;
}

describe('EZD-120d dev model route', () => {
  let tenant = '';
  let project = '';
  let viewerCookies: Map<string, string>;
  let editorCookies: Map<string, string>;
  let noViewCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    const noView = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, noView.membershipId, ['edit_model']);
    viewerCookies = await cookiesFor(viewer.email);
    editorCookies = await cookiesFor(editor.email);
    noViewCookies = await cookiesFor(noView.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R2 answers 404 in production, 401, 404, 403, then the checkpoint count', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    state.store = new Map(viewerCookies);
    const a = await read(project);
    expect(a.res.status).toBe(404);
    expect(a.text).toBe('');
    vi.unstubAllEnvs();
    delete process.env.VERCEL_ENV;

    state.store = new Map();
    const b = await read(project);
    expect(b.res.status).toBe(401);
    expect(JSON.parse(b.text)).toEqual(NOT_SIGNED_IN);

    state.store = new Map(viewerCookies);
    const c = await read('nope');
    expect(c.res.status).toBe(404);
    expect(JSON.parse(c.text)).toEqual(NOT_FOUND);

    state.store = new Map(noViewCookies);
    const d = await read(project);
    expect(d.res.status).toBe(403);

    state.store = new Map(editorCookies);
    expect(await checkpoint(project)).toBe(201);
    state.store = new Map(editorCookies);
    expect(await checkpoint(project)).toBe(201);

    state.store = new Map(viewerCookies);
    const e = await read(project);
    expect(e.res.status).toBe(200);
    expect(JSON.parse(e.text)).toEqual({ checkpoints: 2 });
  }, 120000);
});
