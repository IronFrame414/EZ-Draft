// EZD-120a R2 (vault/plans/EZD-120a.md section 3 route row, section 4; AC-EZD-120a-4, -5). Same sign-in
// and mocks as app/src/app/api/settings/customers/route.test.ts. Expected values: section 3 (201
// `{ version: { id } }`), Decided "Error mapping" (401, 403 `error.not_authorized`, 404 `project_not_found`).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

async function checkpoint(id: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/checkpoints`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  );
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  return { res, json };
}

describe('EZD-120a checkpoint route', () => {
  let tenant = '';
  let project = '';
  let editorCookies: Map<string, string>;
  let plainCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    const plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, ['view_projects']);
    editorCookies = await cookiesFor(editor.email);
    plainCookies = await cookiesFor(plain.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R2 refuses no session, no edit_model and a bad id, and makes a version for an editor', async () => {
    const count = async () =>
      (
        await harnessSql()<{ n: string }[]>`select count(*)::text as n from public.model_version
          where project_id = ${project}::uuid`
      )[0].n;

    state.store = new Map();
    const a = await checkpoint(project);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(plainCookies);
    const b = await checkpoint(project);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    state.store = new Map(editorCookies);
    const c = await checkpoint('nope');
    expect(c.res.status).toBe(404);
    expect(c.json).toEqual(NOT_FOUND);
    expect(await count()).toBe('0');

    state.store = new Map(editorCookies);
    const d = await checkpoint(project);
    expect(d.res.status).toBe(201);
    const id = (d.json as { version: { id: string } }).version.id;
    expect(typeof id).toBe('string');
    expect(await count()).toBe('1');
    const rows = await harnessSql()`select id from public.model_version where id = ${id}::uuid`;
    expect(rows).toHaveLength(1);
  }, 120000);
});
