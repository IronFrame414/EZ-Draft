// EZD-1404 (AC-EZD-1404-1 "A signed-in crew member opens the seeded pack"; S17 Permissions "View projects (scoped to
// assigned projects)"; States "No set sent yet"; CLAUDE.md rule 4). next/headers is mocked and members sign in as in
// ../field-measure/route.test.ts. Expected values: the route header (401, 403, 404 for a malformed id, a project the
// crew member is not listed on and another company's project, then 200); the seeded pack (Version 3, rooms Kitchen
// and Pantry, two tasks, the note) and pack null for a listed project with no issue.
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
import { seedFieldPack } from '../../../../../../e2e/fixtures/field-pack';
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


async function call(id: string) {
  const route = await import('./route');
  const req = new Request(`http://localhost/api/projects/${id}/field-pack`);
  const res = await route.GET(req, { params: Promise.resolve({ id }) });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe('EZD-1404 /api/projects/[id]/field-pack', () => {
  let project = '';
  let empty = '';
  let unlisted = '';
  let crew: Map<string, string>;
  let noView: Map<string, string>;
  let otherCompany: Map<string, string>;

  beforeAll(async () => {
    const tenantA = await createTenant();
    const tenantB = await createTenant();
    [project, empty, unlisted] = (await createProjects(tenantA, 3)) as [string, string, string];
    const c = await createMember({ tenantId: tenantA, scope: 'listed', listed: [project, empty] });
    await setPermissions(tenantA, c.membershipId, [
      'view_projects',
      'check_off_tasks',
      'photo_notes',
      'flag_conflict',
    ]);
    const n = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, n.membershipId, ['settings_company']);
    const o = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, o.membershipId, ['view_projects']);
    await seedFieldPack(harnessSql(), {
      tenantId: tenantA,
      projectId: project,
      rooms: ['Kitchen', 'Pantry'],
      versionNo: 3,
      taskCount: 2,
      note: 'Sink moved',
    });
    await seedFieldPack(harnessSql(), { tenantId: tenantA, projectId: unlisted });
    crew = await cookiesFor(c.email);
    noView = await cookiesFor(n.email);
    otherCompany = await cookiesFor(o.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('401, 403, then 404 for a malformed id, an unlisted project and another company', async () => {
    state.store = new Map();
    expect((await call(project)).res.status).toBe(401);
    state.store = new Map(noView);
    expect((await call(project)).res.status).toBe(403);
    state.store = new Map(crew);
    expect((await call('nope')).res.status).toBe(404);
    expect((await call(unlisted)).res.status).toBe(404);
    state.store = new Map(otherCompany);
    expect((await call(project)).res.status).toBe(404);
  });

  it('AC-EZD-1404-1 a signed-in crew member reads the seeded pack', async () => {
    state.store = new Map(crew);
    const ok = await call(project);
    expect(ok.res.status).toBe(200);
    expect(ok.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(ok.body.pack).toMatchObject({
      revision: { kind: 'version', no: 3 },
      note: 'Sink moved',
      openTasks: 2,
      rooms: [{ name: 'Kitchen' }, { name: 'Pantry' }],
    });
  });

  it('a listed project with no issue answers pack null', async () => {
    state.store = new Map(crew);
    const ok = await call(empty);
    expect(ok.res.status).toBe(200);
    expect(ok.body.pack).toBeNull();
  });
});
