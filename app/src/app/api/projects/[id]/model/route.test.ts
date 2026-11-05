// EZD-120b R2 (vault/plans/EZD-120b.md section 3 route row, section 4; AC-EZD-120b-5). Same sign-in and
// mocks as app/src/app/api/projects/[id]/checkpoints/route.test.ts. Expected values: section 3 route row (401;
// 403 `permission_denied`; one 404 `project_not_found` body for unknown, malformed, other-tenant and
// out-of-scope projects; `no-store`), ARCH Errors (`{ error: { code, message_key } }`).
import { randomUUID } from 'node:crypto';
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
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const NOT_FOUND = { error: { code: 'project_not_found', message_key: 'error.project_not_found' } };

async function read(id: string): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/model`), {
    params: Promise.resolve({ id }),
  });
  return { res, json: JSON.parse(await res.text()) };
}

describe('EZD-120b model load route', () => {
  let projectA = '';
  let projectB = '';
  let editorCookies: Map<string, string>;
  let noViewCookies: Map<string, string>;
  let listedCookies: Map<string, string>;

  beforeAll(async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    [projectA] = await createProjects(tenantA, 1);
    [projectB] = await createProjects(tenantB, 1);
    const editor = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, editor.membershipId, ['view_projects', 'edit_model']);
    const noView = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, noView.membershipId, ['edit_model']);
    const listed = await createMember({ tenantId: tenantA, scope: 'listed', listed: [] });
    await setPermissions(tenantA, listed.membershipId, ['view_projects']);
    editorCookies = await cookiesFor(editor.email);
    noViewCookies = await cookiesFor(noView.email);
    listedCookies = await cookiesFor(listed.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R2 answers 401, 403 and one 404 body, and 200 for an editor', async () => {
    state.store = new Map();
    const a = await read(projectA);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(noViewCookies);
    const b = await read(projectA);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    const notFound: { res: Response; json: unknown }[] = [];
    state.store = new Map(listedCookies);
    notFound.push(await read(projectA));
    state.store = new Map(editorCookies);
    notFound.push(await read(projectB));
    notFound.push(await read(randomUUID()));
    notFound.push(await read('abc'));
    for (const n of notFound) {
      expect(n.res.status).toBe(404);
      expect(n.res.headers.get('cache-control')).toContain('no-store');
      expect(n.json).toEqual(NOT_FOUND);
    }

    state.store = new Map(editorCookies);
    const ok = await read(projectA);
    expect(ok.res.status).toBe(200);
    expect(ok.res.headers.get('cache-control')).toContain('no-store');
    expect((ok.json as { project: { id: string } }).project.id).toBe(projectA);
  }, 120000);
});
