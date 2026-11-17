// EZD-129 Project access routes (AC-EZD-129-2, -4): GET and PUT /api/settings/users/[id]/scope and
// GET /api/settings/users/projects. next/headers is mocked and members sign in as in
// app/src/app/api/settings/users/[id]/route.test.ts; emit is a spy. Expected values: S15 Decision 13 (All
// projects or Listed projects with a project picker); Q-0695 decisions 10 rows 59 (settings_users for every
// Users write; 403 otherwise), 63 (zero listed projects saves); architecture "Errors and logging" (401
// not_signed_in, 403 permission_denied / error.not_authorized, 400 invalid_input, 404, Cache-Control no-store).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../../test-harness/rls/fixtures';
import { addUser } from '../../../../../../../test-harness/users/fixtures';
import { EVENTS } from '../../../../../../lib/events/registry';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../../server/auth/supabase-server';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  emitted: [] as { name: string; payload: unknown; ctx: unknown }[],
}));

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

vi.mock('../../../../../../server/events', () => ({
  emit: vi.fn(async (name: string, payload: unknown, ctx: unknown) => {
    state.emitted.push({ name, payload, ctx });
  }),
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

const BASE = 'http://localhost/api/settings/users';
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (res: Response) => JSON.parse(await res.text()) as unknown;
const err = (code: string, key = `error.${code}`) => ({ error: { code, message_key: key } });
const noStore = (res: Response) =>
  expect(res.headers.get('cache-control') ?? '').toContain('no-store');

async function get(id: string): Promise<Response> {
  const { GET } = await import('./route');
  return GET(new Request(`${BASE}/${id}/scope`), params(id));
}
async function put(id: string, payload: unknown): Promise<Response> {
  const { PUT } = await import('./route');
  return PUT(
    new Request(`${BASE}/${id}/scope`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }),
    params(id),
  );
}
async function projects(q?: string): Promise<Response> {
  const { GET } = await import('../../projects/route');
  return GET(new Request(`${BASE}/projects${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`));
}

async function listedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ id: string }[]>`
    select project_id::text as id from public.membership_project
    where membership_id = ${membershipId}::uuid order by project_id`;
  return rows.map((r) => r.id);
}

describe('EZD-129 Project access routes', () => {
  let t: string;
  let owner: Member;
  let designer: Member;
  let p1: string;
  let p2: string;
  let ownerCookies: Map<string, string>;
  let designerCookies: Map<string, string>;

  beforeAll(async () => {
    t = await createTenant();
    [p1, p2] = await createProjects(t, 2);
    await harnessSql()`update public.project set name = 'Alpha kitchen' where id = ${p1}::uuid`;
    await harnessSql()`update public.project set name = 'Beta bath' where id = ${p2}::uuid`;
    owner = await addUser(t, { preset: 'owner', name: 'Access Owner' });
    designer = await addUser(t, { preset: 'designer', name: 'Access Designer' });
    ownerCookies = await cookiesFor(owner.email);
    designerCookies = await cookiesFor(designer.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    state.emitted = [];
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('user.scope_changed is registered as log_only', () => {
    expect(EVENTS['user.scope_changed'].kind).toBe('log_only');
  });

  it('401 signed out, 403 without settings_users, 404 for a malformed or unknown id', async () => {
    const c = await addUser(t, { preset: 'crew' });
    state.store = new Map();
    for (const res of [await get(c.membershipId), await put(c.membershipId, { scope: 'all', projectIds: [] }), await projects()]) {
      expect(res.status).toBe(401);
      noStore(res);
    }
    state.store = new Map(designerCookies);
    for (const res of [
      await get(c.membershipId),
      await put(c.membershipId, { scope: 'listed', projectIds: [p1] }),
      await projects(),
    ]) {
      expect(res.status).toBe(403);
      expect(await body(res)).toEqual(err('permission_denied', 'error.not_authorized'));
      noStore(res);
    }
    expect(await listedOf(c.membershipId)).toEqual([]);
    state.store = new Map(ownerCookies);
    for (const id of ['not-a-uuid', crypto.randomUUID()]) {
      const res = await get(id);
      expect(res.status).toBe(404);
      expect(await body(res)).toEqual(err('member_not_found'));
    }
  }, 120000);

  it('PUT saves Listed projects and answers the saved access; GET reads it back (AC-2)', async () => {
    const c = await addUser(t, { preset: 'crew' });
    state.store = new Map(ownerCookies);
    const res = await put(c.membershipId, { scope: 'listed', projectIds: [p2, p1] });
    expect(res.status).toBe(200);
    noStore(res);
    const expected = {
      scope: 'listed',
      projects: [
        { id: p1, name: 'Alpha kitchen' },
        { id: p2, name: 'Beta bath' },
      ],
    };
    expect(await body(res)).toEqual(expected);
    expect(state.emitted.map((e) => e.name)).toEqual(['user.scope_changed']);
    expect(state.emitted[0].payload).toMatchObject({
      membershipId: c.membershipId,
      oldScope: 'all',
      scope: 'listed',
    });

    const read = await get(c.membershipId);
    expect(read.status).toBe(200);
    expect(await body(read)).toEqual(expected);

    // A save that changes nothing emits nothing.
    state.emitted = [];
    const same = await put(c.membershipId, { scope: 'listed', projectIds: [p1, p2] });
    expect(same.status).toBe(200);
    expect(state.emitted).toEqual([]);
  }, 120000);

  it('Listed with zero projects saves (AC-4)', async () => {
    const c = await addUser(t, { preset: 'crew' });
    state.store = new Map(ownerCookies);
    const res = await put(c.membershipId, { scope: 'listed', projectIds: [] });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ scope: 'listed', projects: [] });
  }, 120000);

  it('400 for a bad body or an unavailable project; nothing is written', async () => {
    const c = await addUser(t, { preset: 'crew' });
    const tb = await createTenant();
    const [elsewhere] = await createProjects(tb, 1);
    state.store = new Map(ownerCookies);
    for (const bad of [
      'not json',
      {},
      { scope: 'some', projectIds: [] },
      { scope: 'all', projectIds: [p1] },
      { scope: 'listed', projectIds: [p1, p1] },
      { scope: 'listed', projectIds: ['nope'] },
      { scope: 'listed', projectIds: [], extra: 1 },
      { scope: 'listed', projectIds: Array.from({ length: 1001 }, () => crypto.randomUUID()) },
    ]) {
      const res = await put(c.membershipId, bad);
      expect(res.status, JSON.stringify(bad).slice(0, 60)).toBe(400);
      expect(await body(res)).toEqual(err('invalid_input'));
    }
    const res = await put(c.membershipId, { scope: 'listed', projectIds: [elsewhere] });
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual(err('project_unavailable'));
    expect(await listedOf(c.membershipId)).toEqual([]);
  }, 120000);

  it('GET /api/settings/users/projects lists the choices and searches; 400 for a search over 200 characters', async () => {
    state.store = new Map(ownerCookies);
    const res = await projects();
    expect(res.status).toBe(200);
    noStore(res);
    const page = (await body(res)) as { items: { id: string; name: string }[]; more: boolean };
    expect(page.more).toBe(false);
    expect(page.items.map((i) => i.id)).toEqual([p1, p2]);
    const hit = (await body(await projects('beta'))) as { items: { id: string }[] };
    expect(hit.items.map((i) => i.id)).toEqual([p2]);
    const long = await projects('x'.repeat(201));
    expect(long.status).toBe(400);
    expect(await body(long)).toEqual(err('invalid_input'));
  }, 120000);
});
