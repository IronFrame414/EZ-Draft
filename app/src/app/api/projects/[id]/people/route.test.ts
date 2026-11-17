// EZD-126 R1 (AC-EZD-126-5; S06:81; ARCH Realtime "Payload rule": names come from a route, not the broadcast).
// Same sign-in and mocks as app/src/app/api/projects/[id]/plan-scale/route.test.ts. Expected values: the route
// order of the model route (401 not_signed_in; 403 error.not_authorized; malformed id, a listed project not in
// the list and another company's project 404; `ids` missing, empty, malformed or over 20 ids 400 invalid_input;
// 200 `{ people }` in request order, other-company ids left out, duplicates dropped, never an email; no-store on
// all). Initials per initialsFor (EZD-103a): "Alex Holder" -> "AH"; no name -> the email's first letter.
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

async function get(id: string, ids: string | null): Promise<{ res: Response; json: unknown; text: string }> {
  const { GET } = await import('./route');
  const q = ids === null ? '' : `?ids=${ids}`;
  const res = await GET(new Request(`http://localhost/api/projects/${id}/people${q}`), {
    params: Promise.resolve({ id }),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  return { res, json, text };
}

const codeOf = (json: unknown) => (json as { error?: { code?: string } }).error?.code;
const uuidN = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('EZD-126 people route', () => {
  let project = '';
  let otherProject = '';
  let a = { appUserId: '', email: '' };
  let b = { appUserId: '', email: '' };
  let x = { appUserId: '', email: '' };
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
    a = await createMember({ tenantId: tenant, scope: 'all' });
    b = await createMember({ tenantId: tenant, scope: 'all' });
    x = await createMember({ tenantId: otherTenant, scope: 'all' });
    await adminDb().from('app_user').update({ name: 'Alex Holder' }).eq('id', a.appUserId);
    await adminDb().from('app_user').update({ name: null }).eq('id', b.appUserId);
    await adminDb().from('app_user').update({ name: 'Xavier Other' }).eq('id', x.appUserId);
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

  it('EZD-126 R1 refuses no session, no permission, out-of-scope projects and bad ids, and answers names only', async () => {
    const noStore = (res: Response) => expect(res.headers.get('cache-control')).toBe('no-store');
    const one = a.appUserId;

    state.store = new Map();
    const r401 = await get(project, one);
    expect(r401.res.status).toBe(401);
    expect(r401.json).toEqual({ error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } });
    noStore(r401.res);

    state.store = new Map(qCookies);
    const r403 = await get(project, one);
    expect(r403.res.status).toBe(403);
    expect((r403.json as { error: { message_key: string } }).error.message_key).toBe('error.not_authorized');
    noStore(r403.res);

    for (const [cookies, id] of [
      [mCookies, 'not-a-uuid'],
      [nCookies, project],
      [mCookies, otherProject],
    ] as const) {
      state.store = new Map(cookies);
      const r = await get(id, one);
      expect(r.res.status, id).toBe(404);
      expect(codeOf(r.json), id).toBe('project_not_found');
      noStore(r.res);
    }

    const many = Array.from({ length: 21 }, (_, i) => uuidN(i + 1)).join(',');
    for (const ids of [null, '', 'not-a-uuid', many]) {
      state.store = new Map(mCookies);
      const r = await get(project, ids);
      expect(r.res.status, String(ids)).toBe(400);
      expect(r.json, String(ids)).toEqual({
        error: { code: 'invalid_input', message_key: 'error.invalid_input' },
      });
      noStore(r.res);
    }

    state.store = new Map(mCookies);
    const ok = await get(
      project,
      [a.appUserId, b.appUserId, x.appUserId, a.appUserId.toUpperCase()].join(','),
    );
    expect(ok.res.status).toBe(200);
    expect(ok.json).toEqual({
      people: [
        { appUserId: a.appUserId, name: 'Alex Holder', initials: 'AH' },
        { appUserId: b.appUserId, name: null, initials: b.email[0].toUpperCase() },
      ],
    });
    expect(ok.text).not.toContain('@');
    noStore(ok.res);
  }, 120000);
});
