// EZD-124 (AC-EZD-124-2, -3, -4, -7). Same sign-in and mocks as app/src/app/api/projects/[id]/settings/route.test.ts.
// Expected values: Q-0700 decisions 10 (Rename and Set status need Edit model; Archive and Restore need Delete
// projects; a control the user lacks answers 403; a project out of scope 404); Q-0199 (five statuses, no
// Complete); Q-0201 (Archive and Restore); S01 Card overflow menu (Rename trimmed, not blank).
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

describe('EZD-124 PATCH /api/projects/[id]', () => {
  let project = '';
  let otherProject = '';
  let editor: Map<string, string>;
  let deleter: Map<string, string>;
  let viewer: Map<string, string>;
  const row = async () =>
    (
      await harnessSql()<{ name: string; status: string; archived: boolean }[]>`
        select name, status, archived_at is not null as archived from public.project where id = ${project}::uuid`
    )[0];

  beforeAll(async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    [otherProject] = await createProjects(otherTenant, 1);
    const e = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, e.membershipId, ['view_projects', 'edit_model']);
    const d = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, d.membershipId, ['view_projects', 'delete_projects']);
    const v = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, v.membershipId, ['view_projects']);
    editor = await cookiesFor(e.email);
    deleter = await cookiesFor(d.email);
    viewer = await cookiesFor(v.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('401 signed out, 403 without either switch, 404 for a malformed id or another company', async () => {
    expect((await patch(project, { name: 'X' })).status).toBe(401);
    state.store = new Map(viewer);
    expect((await patch(project, { name: 'X' })).status).toBe(403);
    state.store = new Map(editor);
    expect((await patch('not-a-uuid', { name: 'X' })).status).toBe(404);
    const other = await patch(otherProject, { name: 'X' });
    expect(other.status).toBe(404);
    expect(codeOf(other.json)).toBe('project_not_found');
  });

  it('Rename and Set status with Edit model; 400 for a blank name, Complete or a mixed body', async () => {
    state.store = new Map(editor);
    const r = await patch(project, { name: '  Primary bath  ' });
    expect(r).toEqual({ status: 200, json: { changed: true }, cache: expect.stringContaining('no-store') });
    expect((await row()).name).toBe('Primary bath');
    expect((await patch(project, { status: 'in_build' })).status).toBe(200);
    expect((await row()).status).toBe('in_build');
    for (const bad of [{ name: '   ' }, { status: 'complete' }, { name: 'A', status: 'draft' }, {}, '{']) {
      const b = await patch(project, bad);
      expect(b.status, JSON.stringify(bad)).toBe(400);
      expect(codeOf(b.json)).toBe('invalid_input');
    }
    // Edit model alone may not archive.
    const a = await patch(project, { archived: true });
    expect(a.status).toBe(403);
    expect((await row()).archived).toBe(false);
  });

  it('Archive and Restore with Delete projects; Delete projects alone may not rename', async () => {
    state.store = new Map(deleter);
    expect((await patch(project, { name: 'Nope' })).status).toBe(403);
    expect((await patch(project, { status: 'draft' })).status).toBe(403);
    expect((await patch(project, { archived: true })).json).toEqual({ changed: true });
    expect((await row()).archived).toBe(true);
    expect((await patch(project, { archived: false })).json).toEqual({ changed: true });
    expect((await row()).archived).toBe(false);
  });
});
