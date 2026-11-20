// EZD-714 (S15h Notes; S15c Required notes; AC-EZD-714-1). next/headers is mocked and members sign in as in
// app/src/app/api/projects/[id]/submittal-profile/route.test.ts. Expected values: the route header (GET with View
// projects; 404 for a malformed id or a project of another company) and the AC: the project's profile's
// required notes are in the answer, in the profile's order; general notes are the company's for the project's
// type.
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

async function get(id: string) {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/notes`), {
    params: Promise.resolve({ id }),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { res, body };
}

const addNote = async (tenant: string, text: string, group: string, projectTypes: string[]) =>
  (
    await harnessSql()<
      { id: string }[]
    >`insert into public.library_item (tenant_id, kind, name, data)
      values (${tenant}::uuid, 'note', ${text}, ${JSON.stringify({ group, projectTypes })}::text::jsonb)
      returning id`
  )[0].id;

describe('EZD-714 GET /api/projects/[id]/notes', () => {
  let tenantA = '';
  let tenantB = '';
  let viewer: Map<string, string>;
  let noView: Map<string, string>;
  let viewerB: Map<string, string>;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['settings_company']);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, ['view_projects']);
    viewer = await cookiesFor(m1.email);
    noView = await cookiesFor(m2.email);
    viewerB = await cookiesFor(m3.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it("AC-EZD-714-1: a project using a profile gets that profile's required notes; 401, 403 and 404 first", async () => {
    const general = await addNote(
      tenantA,
      'Verify all dimensions in field before ordering cabinets.',
      'general',
      ['kitchen'],
    );
    const bathGeneral = await addNote(tenantA, 'Bath general note.', 'general', ['bath']);
    const r314 = await addNote(tenantA, 'Smoke alarms per FBC R314.', 'code', ['kitchen']);
    const r310 = await addNote(tenantA, 'Emergency escape per FBC R310.', 'code', ['kitchen']);
    const profile = (
      await harnessSql()<
        { id: string }[]
      >`insert into public.submittal_profile (tenant_id, department, required_notes)
        values (${tenantA}::uuid, 'Broward County', ${[r310, r314]}::uuid[]) returning id`
    )[0].id;
    const [project] = await createProjects(tenantA, 1);
    await harnessSql()`update public.project set submittal_profile_id = ${profile}::uuid where id = ${project}::uuid`;

    state.store = new Map();
    expect((await get(project)).res.status).toBe(401);
    state.store = new Map(noView);
    expect((await get(project)).res.status).toBe(403);
    state.store = new Map(viewer);
    expect((await get('nope')).res.status).toBe(404);
    state.store = new Map(viewerB);
    expect((await get(project)).res.status).toBe(404);

    state.store = new Map(viewer);
    const ok = await get(project);
    expect(ok.res.status).toBe(200);
    expect(ok.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(ok.body).toEqual({
      general: [
        {
          id: general,
          text: 'Verify all dimensions in field before ordering cabinets.',
          group: 'general',
        },
      ],
      required: [
        { id: r310, text: 'Emergency escape per FBC R310.', group: 'code' },
        { id: r314, text: 'Smoke alarms per FBC R314.', group: 'code' },
      ],
    });
    expect(JSON.stringify(ok.body)).not.toContain(bathGeneral);
  });
});
