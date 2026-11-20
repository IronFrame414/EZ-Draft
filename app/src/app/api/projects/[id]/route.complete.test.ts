// EZD-137 (AC-EZD-137-1, -2). Same sign-in and mocks as ./route.test.ts. Expected values: Q-0700 decisions 10 (Mark
// complete and Reopen need Edit model, no lock; a control the user lacks answers 403; a project out of scope 404);
// Q-0191 (Mark complete, Reopen); 09p Status moves rows 1, 2.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../../server/auth/supabase-server';

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

async function patch(id: string, body: unknown): Promise<{ status: number; json: unknown; cache: string }> {
  const route = await import('./route');
  const res = await route.PATCH(
    new Request(`http://localhost/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json(), cache: res.headers.get('cache-control') ?? '' };
}

const codeOf = (json: unknown) => (json as { error?: { code?: string } }).error?.code;

describe('EZD-137 PATCH /api/projects/[id] { complete }', () => {
  let project = '';
  let otherProject = '';
  let editor: Map<string, string>;
  let deleter: Map<string, string>;
  const row = async () =>
    (
      await harnessSql()<{ status: string; completed_from: string | null }[]>`
        select status, completed_from from public.project where id = ${project}::uuid`
    )[0];

  beforeAll(async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    [otherProject] = await createProjects(otherTenant, 1);
    await harnessSql()`update public.project set status = 'permit_submitted' where id = ${project}::uuid`;
    const e = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, e.membershipId, ['view_projects', 'edit_model']);
    const d = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, d.membershipId, ['view_projects', 'delete_projects']);
    editor = await cookiesFor(e.email);
    deleter = await cookiesFor(d.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('Delete projects alone may not mark complete or reopen (403); another company is 404', async () => {
    state.store = new Map(deleter);
    expect((await patch(project, { complete: true })).status).toBe(403);
    expect((await patch(project, { complete: false })).status).toBe(403);
    expect((await row()).status).toBe('permit_submitted');
    state.store = new Map(editor);
    const other = await patch(otherProject, { complete: true });
    expect(other.status).toBe(404);
    expect(codeOf(other.json)).toBe('project_not_found');
  });

  it('Edit model marks complete and reopens to the prior status; a mixed or non-boolean body is 400', async () => {
    state.store = new Map(editor);
    for (const bad of [{ complete: 'yes' }, { complete: true, archived: true }, { complete: null }]) {
      const b = await patch(project, bad);
      expect(b.status, JSON.stringify(bad)).toBe(400);
      expect(codeOf(b.json)).toBe('invalid_input');
    }
    const done = await patch(project, { complete: true });
    expect(done).toEqual({ status: 200, json: { changed: true }, cache: expect.stringContaining('no-store') });
    expect(await row()).toEqual({ status: 'complete', completed_from: 'permit_submitted' });
    expect((await patch(project, { complete: true })).json).toEqual({ changed: false });
    // Set status on a completed project is refused; Reopen is the way back.
    expect((await patch(project, { status: 'approved' })).status).toBe(400);
    expect((await patch(project, { complete: false })).json).toEqual({ changed: true });
    expect(await row()).toEqual({ status: 'permit_submitted', completed_from: null });
  });
});
