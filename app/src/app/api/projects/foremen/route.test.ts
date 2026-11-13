// EZD-129 routes on the Projects side (AC-EZD-129-1, -3): GET /api/projects/foremen, POST /api/projects with
// foremanId, and what a Listed user gets from GET /api/projects and GET /api/projects/[id]/model. next/headers
// is mocked and members sign in as in app/src/app/api/settings/users/[id]/route.test.ts; emit is a spy.
// Expected values: Q-0202 (picking a Foreman lists them on the project); Q-0397; S01 Permissions (Listed users
// see only their projects; the wizard needs Create projects); 09n Project scope row 1 (zero rows for any
// other project id); architecture "Errors and logging".
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import { addUser } from '../../../../../test-harness/users/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';

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

vi.mock('../../../../server/events', () => ({ emit: vi.fn(async () => undefined) }));

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

const body = async (res: Response) => JSON.parse(await res.text()) as unknown;
const noStore = (res: Response) =>
  expect(res.headers.get('cache-control') ?? '').toContain('no-store');

async function foremen(): Promise<Response> {
  const { GET } = await import('./route');
  return GET();
}
async function createWith(payload: unknown): Promise<Response> {
  const { POST } = await import('../route');
  return POST(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}
async function listProjects(): Promise<Response> {
  const { GET } = await import('../route');
  return GET(new Request('http://localhost/api/projects?sort=name'));
}
async function model(id: string): Promise<Response> {
  const { GET } = await import('../[id]/model/route');
  return GET(new Request(`http://localhost/api/projects/${id}/model`), {
    params: Promise.resolve({ id }),
  });
}

async function listedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ id: string }[]>`
    select project_id::text as id from public.membership_project
    where membership_id = ${membershipId}::uuid order by project_id`;
  return rows.map((r) => r.id);
}

const NEW = { name: 'Hendricks kitchen', address: '1 Main St', type: 'kitchen', customerId: null, scopeOfWork: '' };

describe('EZD-129 Foreman and Listed users on the Projects routes', () => {
  let t: string;
  let owner: Member;
  let crew: Member;
  let listedForeman: Member;
  let ownerCookies: Map<string, string>;

  beforeAll(async () => {
    t = await createTenant();
    owner = await addUser(t, { preset: 'owner', name: 'Josh Owner' });
    crew = await addUser(t, { preset: 'crew', name: 'Carl Crew' });
    listedForeman = await addUser(t, { preset: 'foreman', name: 'Luis Ortega' });
    await harnessSql()`update public.membership set scope = 'listed'
      where id = ${listedForeman.membershipId}::uuid`;
    ownerCookies = await cookiesFor(owner.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('GET /api/projects/foremen: 401 signed out, 403 without Create projects, 200 the active members by name', async () => {
    state.store = new Map();
    const out = await foremen();
    expect(out.status).toBe(401);
    noStore(out);

    state.store = new Map(await cookiesFor(crew.email));
    const denied = await foremen();
    expect(denied.status).toBe(403);
    expect(await body(denied)).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });

    state.store = new Map(ownerCookies);
    const res = await foremen();
    expect(res.status).toBe(200);
    noStore(res);
    expect(await body(res)).toEqual({
      members: [
        { membershipId: crew.membershipId, name: 'Carl Crew', email: crew.email, scope: 'all' },
        { membershipId: owner.membershipId, name: 'Josh Owner', email: owner.email, scope: 'all' },
        {
          membershipId: listedForeman.membershipId,
          name: 'Luis Ortega',
          email: listedForeman.email,
          scope: 'listed',
        },
      ],
    });
  }, 120000);

  it('POST /api/projects with a Listed Foreman lists them on it (AC-3); a bad Foreman answers 400', async () => {
    state.store = new Map(ownerCookies);
    const res = await createWith({ ...NEW, foremanId: listedForeman.membershipId });
    expect(res.status).toBe(201);
    const { project } = (await body(res)) as { project: { id: string } };
    expect(await listedOf(listedForeman.membershipId)).toEqual([project.id]);

    const unknown = await createWith({ ...NEW, foremanId: crypto.randomUUID() });
    expect(unknown.status).toBe(400);
    expect(await body(unknown)).toEqual({
      error: { code: 'foreman_unavailable', message_key: 'error.foreman_unavailable' },
    });
    const malformed = await createWith({ ...NEW, foremanId: 'luis' });
    expect(malformed.status).toBe(400);
  }, 120000);

  it('a user listed on one of two projects gets only that one from GET /api/projects and 404 for the other model (AC-1)', async () => {
    const [mine, other] = await createProjects(t, 2);
    const listed = await addUser(t, { preset: 'crew', name: 'One Project' });
    await harnessSql()`update public.membership set scope = 'listed' where id = ${listed.membershipId}::uuid`;
    await harnessSql()`insert into public.membership_project (tenant_id, membership_id, project_id)
      values (${t}::uuid, ${listed.membershipId}::uuid, ${mine}::uuid)`;
    state.store = new Map(await cookiesFor(listed.email));
    const res = await listProjects();
    expect(res.status).toBe(200);
    const page = (await body(res)) as { items: { id: string }[] };
    expect(page.items.map((i) => i.id)).toEqual([mine]);
    const hidden = await model(other);
    expect(hidden.status).toBe(404);
    expect(await body(hidden)).toMatchObject({ error: { code: 'project_not_found' } });
  }, 120000);
});
