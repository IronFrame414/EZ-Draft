// EZD-1415 (S17b Field measure; Permissions "Send field measurement to create and send; View projects to view";
// CLAUDE.md rule 4). next/headers is mocked and members sign in as in ../notes/route.test.ts. Expected values: the
// route header (401, 403, 404 for a malformed id or another company's project, then 200), a new project has the
// Building alone with no shape, and an L-shape saved by a member with Send field measurement reads back with six
// walls (S17b Shape picker; AC-EZD-1418-1 "six existing walls").
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

async function call(method: 'GET' | 'PUT', id: string, body?: unknown) {
  const route = await import('./route');
  const req = new Request(`http://localhost/api/projects/${id}/field-measure`, {
    method,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const res = await route[method](req, { params: Promise.resolve({ id }) });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { res, body: parsed };
}

const BUILDING = {
  id: 'building',
  kind: 'building',
  name: 'Building',
  shape: null,
  corners: [],
  closed: false,
  lengths: [],
  ceiling: null,
};
const KITCHEN_L = {
  id: 'r1',
  kind: 'room',
  name: 'Kitchen',
  shape: 'l',
  corners: [],
  closed: true,
  lengths: [null, null, null, null, null, null],
  ceiling: 108,
};

describe('EZD-1415 /api/projects/[id]/field-measure', () => {
  let tenantA = '';
  let tenantB = '';
  let project = '';
  let measurer: Map<string, string>;
  let viewer: Map<string, string>;
  let noView: Map<string, string>;
  let measurerB: Map<string, string>;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [project] = await createProjects(tenantA, 1);
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects', 'send_field_measurement']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects']);
    const m3 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m3.membershipId, ['settings_company']);
    const m4 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m4.membershipId, ['view_projects', 'send_field_measurement']);
    measurer = await cookiesFor(m1.email);
    viewer = await cookiesFor(m2.email);
    noView = await cookiesFor(m3.email);
    measurerB = await cookiesFor(m4.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('GET: 401, 403, 404, then the Building alone for a new project', async () => {
    state.store = new Map();
    expect((await call('GET', project)).res.status).toBe(401);
    state.store = new Map(noView);
    expect((await call('GET', project)).res.status).toBe(403);
    state.store = new Map(viewer);
    expect((await call('GET', 'nope')).res.status).toBe(404);
    state.store = new Map(measurerB);
    expect((await call('GET', project)).res.status).toBe(404);
    state.store = new Map(viewer);
    const ok = await call('GET', project);
    expect(ok.res.status).toBe(200);
    expect(ok.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(ok.body).toEqual({ rooms: [BUILDING] });
  });

  it('PUT: Send field measurement saves an L-shaped room that a viewer reads back', async () => {
    const rooms = [BUILDING, KITCHEN_L];
    state.store = new Map();
    expect((await call('PUT', project, { rooms })).res.status).toBe(401);
    state.store = new Map(viewer);
    expect((await call('PUT', project, { rooms })).res.status).toBe(403);
    state.store = new Map(measurerB);
    expect((await call('PUT', project, { rooms })).res.status).toBe(404);

    state.store = new Map(measurer);
    const saved = await call('PUT', project, { rooms });
    expect(saved.res.status).toBe(200);
    // EZD-2002: the answer carries when the database stored the rooms.
    const answer = saved.body as { status: string; savedAt: string };
    expect(answer.status).toBe('saved');
    expect(Number.isNaN(Date.parse(answer.savedAt))).toBe(false);
    const [row] = (
      await adminDb().from('field_measure_session').select('updated_at').eq('project_id', project)
    ).data as { updated_at: string }[];
    expect(answer.savedAt).toBe(row!.updated_at);

    state.store = new Map(viewer);
    const read = await call('GET', project);
    expect(read.body).toEqual({ rooms });
    const kitchen = (read.body as { rooms: (typeof KITCHEN_L)[] }).rooms[1];
    expect(kitchen?.lengths).toHaveLength(6);
  });

  it('PUT: 400 for a body that is not a room list', async () => {
    state.store = new Map(measurer);
    expect((await call('PUT', project, 'not json')).res.status).toBe(400);
    expect((await call('PUT', project, { rooms: [] })).res.status).toBe(400);
    // The Building must come first.
    expect((await call('PUT', project, { rooms: [KITCHEN_L] })).res.status).toBe(400);
    // An L-shape has six walls, not four.
    const wrong = { ...KITCHEN_L, lengths: [null, null, null, null] };
    expect((await call('PUT', project, { rooms: [BUILDING, wrong] })).res.status).toBe(400);
  });
});
