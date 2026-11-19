// EZD-712 (S15c Decision 2: each project picks a profile in project settings, defaulting to the company
// default; Q-0399 lifted). next/headers is mocked and members sign in as in
// app/src/app/api/settings/sheet-presets/routes.test.ts. Expected values: the route header (GET with View projects:
// the project's profile and the company's active profiles; PATCH with Edit model: an active profile of the
// company, else 400 profile_unavailable; project.updated with keys ['submittal_profile_id']).
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
import { createSessionClient, type SessionCookieJar } from '../../../../../server/auth/supabase-server';
import { emit } from '../../../../../server/events';
import type { ProjectProfileAnswer } from '../../../../../lib/submittal-profiles/profiles';

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

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function get(id: string) {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/submittal-profile`), {
    params: Promise.resolve({ id }),
  });
  return { res, json: (await json(res)) as ProjectProfileAnswer };
}

async function patch(id: string, body: unknown) {
  const { PATCH } = await import('./route');
  const res = await PATCH(
    new Request(`http://localhost/api/projects/${id}/submittal-profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: await json(res) };
}

describe('EZD-712 /api/projects/[id]/submittal-profile', () => {
  let tenant = '';
  let project = '';
  let defaultId = '';
  let boca = '';
  let archived = '';
  let editorCookies: Map<string, string>;
  let viewerCookies: Map<string, string>;
  const profileOf = async () =>
    (await harnessSql()`select submittal_profile_id from public.project where id = ${project}::uuid`)[0]
      .submittal_profile_id as string | null;

  beforeAll(async () => {
    tenant = await createTenant();
    await harnessSql()`select private.seed_submittal_profile(${tenant}::uuid)`;
    defaultId = (
      await harnessSql()`select id from public.submittal_profile where tenant_id = ${tenant}::uuid and is_default`
    )[0].id as string;
    boca = (
      await harnessSql()`insert into public.submittal_profile (tenant_id, department)
        values (${tenant}::uuid, 'City of Boca Raton') returning id`
    )[0].id as string;
    archived = (
      await harnessSql()`insert into public.submittal_profile (tenant_id, department, archived_at)
        values (${tenant}::uuid, 'Old paper', now()) returning id`
    )[0].id as string;
    [project] = await createProjects(tenant, 1);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model', 'settings_sheet_presets']);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    editorCookies = await cookiesFor(editor.email);
    viewerCookies = await cookiesFor(viewer.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    emitMock.mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('GET: the project uses the default; the choices are the active profiles, default first', async () => {
    state.store = viewerCookies;
    const a = await get(project);
    expect(a.res.status).toBe(200);
    expect(a.json.profileId).toBe(defaultId);
    expect(a.json.profiles.map((p) => [p.department, p.isDefault])).toEqual([
      ['Palm Beach County', true],
      ['City of Boca Raton', false],
    ]);
    expect(a.json.canManage).toBe(false);
    state.store = editorCookies;
    expect((await get(project)).json.canManage).toBe(true);
  });

  it('PATCH: Edit model picks an active profile; project.updated names the key', async () => {
    state.store = viewerCookies;
    expect((await patch(project, { profileId: boca })).res.status).toBe(403);
    expect(await profileOf()).toBe(defaultId);

    state.store = editorCookies;
    const ok = await patch(project, { profileId: boca });
    expect(ok.res.status).toBe(200);
    expect(ok.json).toEqual({ profileId: boca });
    expect(await profileOf()).toBe(boca);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('project.updated');
    expect(emitMock.mock.calls[0][1]).toEqual({ projectId: project, keys: ['submittal_profile_id'] });

    emitMock.mockClear();
    expect((await patch(project, { profileId: boca })).res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();

    const bad = await patch(project, { profileId: archived });
    expect(bad.res.status).toBe(400);
    expect((bad.json as { error: { code: string } }).error.code).toBe('profile_unavailable');
    expect((await patch(project, { profileId: 'nope' })).res.status).toBe(400);
    expect(await profileOf()).toBe(boca);

    // The archived profile a project already uses stays listed so the dialog can show it.
    await adminDb().from('project').update({ submittal_profile_id: archived }).eq('id', project);
    expect((await get(project)).json.profiles.map((p) => p.department)).toContain('Old paper');
  });
});
