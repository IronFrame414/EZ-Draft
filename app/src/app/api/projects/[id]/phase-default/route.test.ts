// EZD-214 (AC-EZD-214-1, -7; 03 Q-0664 "View default": the toggle writes it with Edit model; for a view-only user
// it saves nothing). Same sign-in and mocks as the EZD-219 plan-scale route test. Expected values: the plan-scale
// route's order (401 not_signed_in; malformed id 404; 403 error.not_authorized; bad JSON or a body that is not
// exactly `{ phase: 'existing' | 'proposed' }` 400 invalid_input; another company's project 404; 200 `{ phase }`).
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

async function put(id: string, body: string): Promise<{ res: Response; json: unknown }> {
  const { PUT } = await import('./route');
  const res = await PUT(
    new Request(`http://localhost/api/projects/${id}/phase-default`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    }),
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

const codeOf = (json: unknown) => (json as { error?: { code?: string } }).error?.code;

describe('EZD-214 phase default route', () => {
  let project = '';
  let otherProject = '';
  let editorCookies: Map<string, string>;
  let viewerCookies: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    [otherProject] = await createProjects(otherTenant, 1);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    editorCookies = await cookiesFor(editor.email);
    viewerCookies = await cookiesFor(viewer.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-214 refuses no session, view-only, bad ids and bad bodies, and saves for an editor', async () => {
    const phaseOf = async (id: string) =>
      (
        await harnessSql()<{ phase_default: string }[]>`
        select phase_default from public.project where id = ${id}::uuid`
      )[0].phase_default;
    const noStore = (res: Response) => expect(res.headers.get('cache-control')).toBe('no-store');
    const valid = JSON.stringify({ phase: 'proposed' });

    state.store = new Map();
    const a = await put(project, valid);
    expect(a.res.status).toBe(401);
    expect(codeOf(a.json)).toBe('not_signed_in');
    noStore(a.res);

    state.store = new Map(viewerCookies);
    const b = await put(project, valid);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });
    noStore(b.res);
    expect(await phaseOf(project)).toBe('existing');

    state.store = new Map(editorCookies);
    const c = await put('not-a-uuid', valid);
    expect(c.res.status).toBe(404);
    expect(codeOf(c.json)).toBe('project_not_found');

    state.store = new Map(editorCookies);
    const d = await put(otherProject, valid);
    expect(d.res.status).toBe(404);
    expect(codeOf(d.json)).toBe('project_not_found');
    expect(await phaseOf(otherProject)).toBe('existing');

    const badBodies = [
      '{',
      '{}',
      JSON.stringify({ phase: 'demo' }),
      JSON.stringify({ phase: 'Proposed' }),
      JSON.stringify({ phase: null }),
      JSON.stringify({ phase: 'proposed', x: 1 }),
    ];
    for (const body of badBodies) {
      state.store = new Map(editorCookies);
      const r = await put(project, body);
      expect(r.res.status, body).toBe(400);
      expect(codeOf(r.json), body).toBe('invalid_input');
      noStore(r.res);
    }
    expect(await phaseOf(project)).toBe('existing');

    state.store = new Map(editorCookies);
    const e = await put(project, valid);
    expect(e.res.status).toBe(200);
    expect(e.json).toEqual({ phase: 'proposed' });
    noStore(e.res);
    expect(await phaseOf(project)).toBe('proposed');

    state.store = new Map(editorCookies);
    const f = await put(project, JSON.stringify({ phase: 'existing' }));
    expect(f.res.status).toBe(200);
    expect(await phaseOf(project)).toBe('existing');
  }, 120000);
});
