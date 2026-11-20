// EZD-712 (AC-EZD-712-1; S15c). next/headers is mocked and members sign in as in
// app/src/app/api/settings/code-edition/route.test.ts; emit is wrapped in vi.fn. Expected values: S15c Controls
// (New profile copies the default; name required and unique; Set as default makes the profile the company default
// for new projects; Duplicate; Delete; the default cannot be removed), S15c Events (submittal_profile.created,
// .updated, .deleted), S15c Permissions (settings_sheet_presets; 403 without it), S15c Decision 2 (a project
// defaults to the company default).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
import { emit } from '../../../../server/events';
import type { SubmittalProfile } from '../../../../lib/submittal-profiles/profiles';

vi.mock('../../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});
const emitMock = vi.mocked(emit);

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

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type Answer = { res: Response; json: unknown };

async function list(): Promise<Answer> {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, json: await json(res) };
}

async function post(body: unknown): Promise<Answer> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/settings/sheet-presets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { res, json: await json(res) };
}

async function patch(id: string, body: unknown): Promise<Answer> {
  const { PATCH } = await import('./[id]/route');
  const res = await PATCH(
    new Request(`http://localhost/api/settings/sheet-presets/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: await json(res) };
}

async function remove(id: string): Promise<Answer> {
  const { DELETE } = await import('./[id]/route');
  const res = await DELETE(
    new Request(`http://localhost/api/settings/sheet-presets/${id}`, { method: 'DELETE' }),
    {
      params: Promise.resolve({ id }),
    },
  );
  return { res, json: await json(res) };
}

async function newProject(name: string): Promise<string> {
  const { POST } = await import('../../projects/route');
  const res = await POST(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        address: '336 Golfview Rd',
        type: 'kitchen',
        customerId: null,
        scopeOfWork: '',
      }),
    }),
  );
  expect(res.status).toBe(201);
  return ((await json(res)) as { project: { id: string } }).project.id;
}

const profileOfAnswer = (a: Answer) => (a.json as { profile: SubmittalProfile }).profile;
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const eventsNamed = (name: string) => emitMock.mock.calls.filter((c) => c[0] === name);

describe('EZD-712 /api/settings/sheet-presets', () => {
  let tenant = '';
  let ownerCookies: Map<string, string>;
  let crewCookies: Map<string, string>;
  let defaultId = '';
  const projectProfile = async (id: string) =>
    (await harnessSql()`select submittal_profile_id from public.project where id = ${id}::uuid`)[0]
      .submittal_profile_id as string | null;

  beforeAll(async () => {
    tenant = await createTenant();
    await harnessSql()`select private.seed_submittal_profile(${tenant}::uuid)`;
    defaultId = (
      await harnessSql()`select id from public.submittal_profile where tenant_id = ${tenant}::uuid and is_default`
    )[0].id as string;
    const owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, [
      'settings_sheet_presets',
      'view_projects',
      'create_projects',
    ]);
    const crew = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, crew.membershipId, ['view_projects']);
    ownerCookies = await cookiesFor(owner.email);
    crewCookies = await cookiesFor(crew.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    emitMock.mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('GET: any member reads the profiles, the default first and marked', async () => {
    state.store = crewCookies;
    const a = await list();
    expect(a.res.status).toBe(200);
    const profiles = (a.json as { profiles: SubmittalProfile[] }).profiles;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: defaultId,
      department: 'Palm Beach County',
      isDefault: true,
      sheetSize: '24x36',
      namingTemplate: '{address} {description}',
      stampBoxWidthIn: 3,
      stampBoxHeightIn: 3,
      stampBoxPosition: 'bottom_right',
      signer: 'none',
    });
  });

  it('writes need settings_sheet_presets: 403 and no change', async () => {
    state.store = crewCookies;
    const a = await post({ department: 'Broward County' });
    expect(a.res.status).toBe(403);
    expect(a.json).toEqual(FORBIDDEN);
    expect((await patch(defaultId, { fields: { signer: 'architect' } })).res.status).toBe(403);
    expect((await remove(defaultId)).res.status).toBe(403);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('AC-EZD-712-1: a new project uses the default profile; Set as default changes it for new projects', async () => {
    state.store = ownerCookies;
    const first = await newProject('Kitchen one');
    expect(await projectProfile(first)).toBe(defaultId);

    const made = await post({ department: 'City of Boca Raton' });
    expect(made.res.status).toBe(201);
    const boca = profileOfAnswer(made);
    expect(boca.isDefault).toBe(false);
    expect(eventsNamed('submittal_profile.created')[0][1]).toEqual({
      profileId: boca.id,
      sourceId: null,
    });

    const set = await patch(boca.id, { setDefault: true });
    expect(set.res.status).toBe(200);
    expect(profileOfAnswer(set).isDefault).toBe(true);
    expect(eventsNamed('submittal_profile.updated')[0][1]).toEqual({
      profileId: boca.id,
      fields: ['is_default'],
    });

    const second = await newProject('Kitchen two');
    expect(await projectProfile(second)).toBe(boca.id);
    expect(await projectProfile(first)).toBe(defaultId);

    expect((await patch(defaultId, { setDefault: true })).res.status).toBe(200);
  });

  it('the inspector Save: changed fields only, the event lists them; bad values are 400; a taken name is 409', async () => {
    state.store = ownerCookies;
    const saved = await patch(defaultId, {
      fields: {
        signer: 'electrical_contractor',
        stampBoxWidthIn: 6,
        stampBoxHeightIn: 2,
        stampBoxPosition: 'top_left',
      },
    });
    expect(saved.res.status).toBe(200);
    expect(profileOfAnswer(saved)).toMatchObject({
      signer: 'electrical_contractor',
      stampBoxWidthIn: 6,
      stampBoxHeightIn: 2,
      stampBoxPosition: 'top_left',
    });
    expect(eventsNamed('submittal_profile.updated')[0][1]).toEqual({
      profileId: defaultId,
      fields: ['signer', 'stamp_box_height_in', 'stamp_box_position', 'stamp_box_width_in'],
    });

    emitMock.mockClear();
    const same = await patch(defaultId, { fields: { signer: 'electrical_contractor' } });
    expect(same.res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();

    expect(
      (await patch(defaultId, { fields: { namingTemplate: '{description} {rev}' } })).res.status,
    ).toBe(400);
    expect((await patch(defaultId, { fields: { sheetSize: '11x17' } })).res.status).toBe(400);
    expect((await post({ department: '' })).res.status).toBe(400);
    const taken = await post({ department: 'palm beach county' });
    expect(taken.res.status).toBe(409);
    expect((taken.json as { error: { code: string } }).error.code).toBe('name_taken');
  });

  it('New profile copies the default; Duplicate copies the chosen profile', async () => {
    state.store = ownerCookies;
    const copy = profileOfAnswer(await post({ department: 'Broward County' }));
    expect(copy).toMatchObject({
      signer: 'electrical_contractor',
      stampBoxWidthIn: 6,
      isDefault: false,
    });
    await patch(copy.id, { fields: { submittalType: 'paper' } });
    const dup = await post({ department: 'Broward County copy', sourceId: copy.id });
    expect(dup.res.status).toBe(201);
    expect(profileOfAnswer(dup).submittalType).toBe('paper');
    expect(eventsNamed('submittal_profile.created').at(-1)![1]).toEqual({
      profileId: profileOfAnswer(dup).id,
      sourceId: copy.id,
    });
  });

  it("archive and delete: never the default; a deleted profile's projects move to the default", async () => {
    state.store = ownerCookies;
    const blocked = await remove(defaultId);
    expect(blocked.res.status).toBe(409);
    expect((blocked.json as { error: { code: string } }).error.code).toBe('profile_is_default');
    expect((await patch(defaultId, { archived: true })).res.status).toBe(409);

    const wpb = profileOfAnswer(await post({ department: 'City of West Palm Beach' }));
    const project = await newProject('Bath one');
    await adminDb().from('project').update({ submittal_profile_id: wpb.id }).eq('id', project);

    const archived = await patch(wpb.id, { archived: true });
    expect(archived.res.status).toBe(200);
    expect(profileOfAnswer(archived).archived).toBe(true);

    emitMock.mockClear();
    const gone = await remove(wpb.id);
    expect(gone.res.status).toBe(200);
    expect(gone.json).toEqual({ movedProjects: 1 });
    expect(await projectProfile(project)).toBe(defaultId);
    expect(eventsNamed('submittal_profile.deleted')[0][1]).toEqual({
      profileId: wpb.id,
      movedProjects: 1,
    });
    expect((await remove(wpb.id)).res.status).toBe(404);
  });
});
