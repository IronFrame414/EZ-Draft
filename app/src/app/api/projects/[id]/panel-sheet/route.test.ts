// EZD-708c (S06 Events emitted "sheet.updated (new) on Add to E2.0"; S06 Permissions "Add to E2.0: Edit model"): the
// panel sheet event route. Same sign-in and mocks as the plan-scale route test. Expected: 401 not_signed_in; 403
// error.not_authorized without Edit model; malformed id 404; a body that is not exactly { sheet, panelId } 400;
// another company's project 404; 204 and one sheet.updated row on the project.
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

async function post(id: string, body: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/panel-sheet`, {
      method: 'POST',
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
const PANEL = '55555555-5555-4555-8555-555555555555';

describe('EZD-708c panel sheet event route', () => {
  let tenant = '';
  let project = '';
  let otherProject = '';
  let editorCookies: Map<string, string>;
  let viewerCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
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

  it('refuses no session, view-only, bad ids, bad bodies and another company, and logs sheet.updated', async () => {
    const valid = JSON.stringify({ sheet: 'E2.0', panelId: PANEL });
    const logged = async () =>
      harnessSql()<{ object_type: string; object_id: string; details: unknown }[]>`
        select object_type, object_id, details from public.event_log
        where action = 'sheet.updated' and tenant_id = ${tenant}::uuid`;

    state.store = new Map();
    const a = await post(project, valid);
    expect(a.res.status).toBe(401);
    expect(codeOf(a.json)).toBe('not_signed_in');

    state.store = new Map(viewerCookies);
    const b = await post(project, valid);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual({ error: { code: 'permission_denied', message_key: 'error.not_authorized' } });

    state.store = new Map(editorCookies);
    const c = await post('not-a-uuid', valid);
    expect(c.res.status).toBe(404);
    expect(codeOf(c.json)).toBe('project_not_found');

    for (const bad of [
      'not json',
      JSON.stringify({ sheet: 'E2.0' }),
      JSON.stringify({ sheet: 'A1.0', panelId: PANEL }),
      JSON.stringify({ sheet: 'E2.0', panelId: 'Panel A' }),
      JSON.stringify({ sheet: 'E2.0', panelId: PANEL, extra: 1 }),
    ]) {
      const d = await post(project, bad);
      expect(d.res.status, bad).toBe(400);
      expect(codeOf(d.json)).toBe('invalid_input');
    }

    const e = await post(otherProject, valid);
    expect(e.res.status).toBe(404);
    expect(codeOf(e.json)).toBe('project_not_found');
    expect(await logged()).toHaveLength(0);

    const f = await post(project, valid);
    expect(f.res.status).toBe(204);
    expect(f.res.headers.get('cache-control')).toBe('no-store');
    const rows = await logged();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ object_type: 'project', object_id: project });
  });
});
