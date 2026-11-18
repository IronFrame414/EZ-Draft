// EZD-127 R1 (AC-EZD-127-1; 04 Header card "N to review" pill). Same sign-in and mocks as
// app/src/app/api/projects/[id]/people/route.test.ts. Expected values: the route order of the people route (401
// not_signed_in; 403 error.not_authorized; a malformed id, a listed project not in the list and another company's
// project 404 project_not_found; a `list` other than 1 400 invalid_input; no-store on all); one test review item
// (source field_conflict) gives `{ count: 1 }`, and with ?list=1 the one group; the count is the stored
// project.open_items_count (phase-01 EZD-127 "never counted across tables on page load").
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

async function get(id: string, query = ''): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/review${query}`), {
    params: Promise.resolve({ id }),
  });
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

describe('EZD-127 review route', () => {
  let project = '';
  let otherProject = '';
  let mCookies: Map<string, string>;
  let nCookies: Map<string, string>;
  let qCookies: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const [p1, p2] = await createProjects(tenant, 2);
    project = p1;
    [otherProject] = await createProjects(otherTenant, 1);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const n = await createMember({ tenantId: tenant, scope: 'listed', listed: [p2] });
    await setPermissions(tenant, n.membershipId, ['view_projects']);
    const q = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, q.membershipId, []);
    await harnessSql()`select private.add_review_item(${project}::uuid, 'field_conflict', 'test-1')`;
    mCookies = await cookiesFor(m.email);
    nCookies = await cookiesFor(n.email);
    qCookies = await cookiesFor(q.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-127 R1 refuses no session, no permission, out-of-scope projects and bad queries, and answers the stored count', async () => {
    const noStore = (res: Response) => expect(res.headers.get('cache-control')).toBe('no-store');

    state.store = new Map();
    const r401 = await get(project);
    expect(r401.res.status).toBe(401);
    expect(r401.json).toEqual({
      error: { code: 'not_signed_in', message_key: 'error.not_signed_in' },
    });
    noStore(r401.res);

    state.store = new Map(qCookies);
    const r403 = await get(project);
    expect(r403.res.status).toBe(403);
    expect((r403.json as { error: { message_key: string } }).error.message_key).toBe(
      'error.not_authorized',
    );
    noStore(r403.res);

    for (const [cookies, id] of [
      [mCookies, 'not-a-uuid'],
      [nCookies, project],
      [mCookies, otherProject],
    ] as const) {
      state.store = new Map(cookies);
      const r = await get(id);
      expect(r.res.status, id).toBe(404);
      expect(codeOf(r.json), id).toBe('project_not_found');
      noStore(r.res);
    }

    for (const query of ['?list=0', '?list=yes', '?list=1&list=1']) {
      state.store = new Map(mCookies);
      const r = await get(project, query);
      expect(r.res.status, query).toBe(400);
      expect(r.json, query).toEqual({
        error: { code: 'invalid_input', message_key: 'error.invalid_input' },
      });
      noStore(r.res);
    }

    state.store = new Map(mCookies);
    const ok = await get(project);
    expect(ok.res.status).toBe(200);
    expect(ok.json).toEqual({ count: 1 });
    noStore(ok.res);

    state.store = new Map(mCookies);
    const list = await get(project, '?list=1');
    expect(list.res.status).toBe(200);
    expect(list.json).toEqual({ count: 1, groups: [{ source: 'field_conflict', count: 1 }] });
    noStore(list.res);
  }, 120000);
});
