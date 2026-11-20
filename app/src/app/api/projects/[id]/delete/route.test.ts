// EZD-124 (AC-EZD-124-1, -5, -7). Same sign-in and mocks as app/src/app/api/projects/[id]/route.test.ts; the job
// runner kick is a stub (CLAUDE.md rule 5). Expected values: Q-0700 decisions 10 (Delete needs Delete projects;
// 403 otherwise; 404 out of scope); examples 09p Delete confirmation (the typed name trimmed, case included);
// Q-0201 (the project and its rows are gone; the purge job is queued).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
} from '../../../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../../../server/auth/supabase-server';

const state = vi.hoisted(() => ({ store: new Map<string, string>(), kicks: 0 }));

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

vi.mock('../../../../../server/jobs/kick', () => ({
  kickJobRunner: () => {
    state.kicks++;
  },
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

async function post(id: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const route = await import('./route');
  const res = await route.POST(
    new Request(`http://localhost/api/projects/${id}/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json() };
}

describe('EZD-124 POST /api/projects/[id]/delete', () => {
  let tenant = '';
  let project = '';
  let otherProject = '';
  let deleter: Map<string, string>;
  let editor: Map<string, string>;
  const exists = async (id: string) =>
    (await harnessSql()`select 1 from public.project where id = ${id}::uuid`).length === 1;
  const named = async (t: string, name: string) =>
    (
      await harnessSql()<{ id: string }[]>`
        insert into public.project (tenant_id, name, address, type)
        values (${t}::uuid, ${name}, '1 Route St', 'kitchen') returning id`
    )[0].id;

  beforeAll(async () => {
    tenant = await createTenant();
    const otherTenant = await createTenant();
    project = await named(tenant, 'Kitchen remodel');
    otherProject = await named(otherTenant, 'Kitchen remodel');
    const d = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, d.membershipId, ['view_projects', 'delete_projects']);
    const e = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, e.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    deleter = await cookiesFor(d.email);
    editor = await cookiesFor(e.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('401, 403 without Delete projects, 404 malformed or another company, 400 for a name that does not match', async () => {
    expect((await post(project, { confirmName: 'Kitchen remodel' })).status).toBe(401);
    state.store = new Map(editor);
    expect((await post(project, { confirmName: 'Kitchen remodel' })).status).toBe(403);
    state.store = new Map(deleter);
    expect((await post('nope', { confirmName: 'Kitchen remodel' })).status).toBe(404);
    expect((await post(otherProject, { confirmName: 'Kitchen remodel' })).status).toBe(404);
    for (const bad of [{ confirmName: 'kitchen remodel' }, { confirmName: '' }, {}, '{']) {
      const r = await post(project, bad);
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await exists(project)).toBe(true);
    expect(await exists(otherProject)).toBe(true);
    expect(state.kicks).toBe(0);
  });

  it('200 with the trimmed name: the project is gone, the purge job is queued and the runner started', async () => {
    state.store = new Map(deleter);
    const r = await post(project, { confirmName: '  Kitchen remodel ' });
    expect(r).toEqual({ status: 200, json: { deleted: true } });
    expect(await exists(project)).toBe(false);
    const jobs = await harnessSql()`
      select 1 from public.job where tenant_id = ${tenant}::uuid and kind = 'project_purge'
        and project_id is null and payload ->> 'projectId' = ${project}`;
    expect(jobs.length).toBe(1);
    expect(state.kicks).toBe(1);
  });
});
