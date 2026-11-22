// EZD-1402 (AC-EZD-1402-2; 03c offline_change; phase-14 EZD-1402 "offline_change.synced"; Q-0503; CLAUDE.md rule 4).
// next/headers is mocked and members sign in as in ../field-measure/route.test.ts. Expected values: the route order
// in server/outbox/field-action-route.ts (another sign-in 401, a bad body 400, no session 401, no switch 403, another
// company's project 404, then 200), a recorded task check answers synced and a resend duplicate, and
// offline_change.synced is written to the event log once.
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

async function call(id: string, body: unknown, membership: string | null, path = '') {
  const route = path === '/photo' ? await import('./photo/route') : await import('./route');
  const req = new Request(`http://localhost/api/projects/${id}/field-actions${path}`, {
    method: 'POST',
    headers: membership === null ? {} : { 'x-ezdraft-membership': membership },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res = await route.POST(req, { params: Promise.resolve({ id }) });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

const DEVICE = '22222222-2222-4222-8222-222222222222';
const action = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  deviceId: DEVICE,
  kind: 'task_check',
  ops: { taskId: 'T1', done: true },
  baseVersionId: null,
  queuedAt: Date.UTC(2026, 10, 21, 14, 30, 0),
  photo: null,
  ...over,
});

describe('EZD-1402 /api/projects/[id]/field-actions', () => {
  let tenantA = '';
  let tenantB = '';
  let project = '';
  let crew: { cookies: Map<string, string>; membershipId: string };
  let viewer: { cookies: Map<string, string>; membershipId: string };
  let crewB: { cookies: Map<string, string>; membershipId: string };

  const member = async (tenant: string, permissions: string[]) => {
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, permissions as never);
    return { cookies: await cookiesFor(m.email), membershipId: m.membershipId };
  };

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    [project] = await createProjects(tenantA, 1);
    crew = await member(tenantA, ['view_projects', 'check_off_tasks', 'photo_notes']);
    viewer = await member(tenantA, ['view_projects']);
    crewB = await member(tenantB, ['view_projects', 'check_off_tasks', 'photo_notes']);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('refusals in order: another sign-in, bad body, no session, no switch, another company', async () => {
    state.store = new Map(crew.cookies);
    expect((await call(project, action(), viewer.membershipId)).res.status).toBe(401);
    expect((await call(project, '{', crew.membershipId)).res.status).toBe(400);
    expect((await call(project, action({ kind: 'cook' }), crew.membershipId)).res.status).toBe(400);
    expect((await call(project, action({ extra: 1 }), crew.membershipId)).res.status).toBe(400);
    state.store = new Map();
    expect((await call(project, action(), null)).res.status).toBe(401);
    state.store = new Map(viewer.cookies);
    const denied = await call(project, action(), viewer.membershipId);
    expect(denied.res.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { code: 'permission_denied' } });
    state.store = new Map(crewB.cookies);
    expect((await call(project, action(), crewB.membershipId)).res.status).toBe(404);
    expect((await call('not-a-uuid', action(), crewB.membershipId)).res.status).toBe(404);
    expect(
      (await call(project, { id: crypto.randomUUID(), kind: 'photo_pin', photo: 'jpg' }, crewB.membershipId, '/photo'))
        .res.status,
    ).toBe(404);
  });

  it('AC-EZD-1402-2 a task check is recorded once and offline_change.synced is logged once', async () => {
    state.store = new Map(crew.cookies);
    const a = action();
    const first = await call(project, a, crew.membershipId);
    expect(first.res.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'synced', syncedAt: expect.any(String) });
    const again = await call(project, a, crew.membershipId);
    expect(again.res.status).toBe(200);
    expect(again.body).toMatchObject({ status: 'duplicate' });
    const logged = await harnessSql()<{ object_type: string; object_id: string; details: unknown }[]>`
      select object_type, object_id, details from public.event_log
      where action = 'offline_change.synced' and tenant_id = ${tenantA}::uuid`;
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ object_type: 'project', object_id: project });
    expect(logged[0]!.details).toMatchObject({ id: a.id, kind: 'task_check' });
  });

  it('the photo start signs an upload at the field-photos path', async () => {
    state.store = new Map(crew.cookies);
    const id = crypto.randomUUID();
    const r = await call(project, { id, kind: 'photo_pin', photo: 'png' }, crew.membershipId, '/photo');
    expect(r.res.status).toBe(200);
    expect(r.body.upload).toMatchObject({
      bucket: 'media',
      path: `${tenantA}/${project}/field-photos/${id}.png`,
    });
    // A photo pin recorded before its photo is stored.
    const early = await call(project, action({ id, kind: 'photo_pin', photo: 'png' }), crew.membershipId);
    expect(early.res.status).toBe(409);
    expect(early.body).toMatchObject({ error: { code: 'photo_missing' } });
  });
});
