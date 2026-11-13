// EZD-107 custom role routes (AC-EZD-107-2, -3, -4). next/headers is mocked and members sign in as in
// app/src/app/api/settings/users/[id]/route.test.ts; emit is a spy, reportError a stub (no live service).
// Expected values: Q-0695 decisions 10 row 59 (settings_users for role create, edit and delete; 403 otherwise),
// 03 row 35 (edit changes defaults only; delete only when nobody holds the role), S15 Validation (names
// unique ignoring case), S15 Events (role.created, role.updated, role.deleted, log_only), architecture
// "Errors and logging" (401 not_signed_in, 403 permission_denied / error.not_authorized, 400, 404, 409;
// Cache-Control no-store), catalog.ts (37 keys), 09n Switch counts (Foreman 11).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import { addUser, PRESET_KEYS, roleId } from '../../../../../test-harness/users/fixtures';
import { EVENTS } from '../../../../lib/events/registry';
import { PERMISSION_KEYS } from '../../../../lib/permissions/catalog';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  emitted: [] as { name: string; payload: unknown; ctx: unknown }[],
  failEmit: false,
  reported: [] as string[],
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

vi.mock('../../../../server/events', () => ({
  emit: vi.fn(async (name: string, payload: unknown, ctx: unknown) => {
    if (state.failEmit) throw new Error('probe');
    state.emitted.push({ name, payload, ctx });
  }),
}));

vi.mock('../../../../server/errors/report', () => ({
  reportError: vi.fn(async (e: Error) => {
    state.reported.push(e.message);
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

const BASE = 'http://localhost/api/settings/roles';
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const body = async (res: Response) => JSON.parse(await res.text()) as unknown;
const err = (code: string, key = `error.${code}`) => ({ error: { code, message_key: key } });
const noStore = (res: Response) =>
  expect(res.headers.get('cache-control') ?? '').toContain('no-store');

const json = (method: string, url: string, payload: unknown) =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

async function get(): Promise<Response> {
  const { GET } = await import('./route');
  return GET();
}
async function post(payload: unknown): Promise<Response> {
  const { POST } = await import('./route');
  return POST(json('POST', BASE, payload));
}
async function patch(id: string, payload: unknown): Promise<Response> {
  const { PATCH } = await import('./[id]/route');
  return PATCH(json('PATCH', `${BASE}/${id}`, payload), params(id));
}
async function remove(id: string): Promise<Response> {
  const { DELETE } = await import('./[id]/route');
  return DELETE(new Request(`${BASE}/${id}`, { method: 'DELETE' }), params(id));
}

async function roleRow(id: string) {
  const rows = await harnessSql()<{ name: string; default_permissions: string[] }[]>`
    select name, default_permissions from public.role where id = ${id}::uuid`;
  return rows[0] ?? null;
}

describe('EZD-107 custom role routes', () => {
  let t: string;
  let owner: Member;
  let designer: Member;
  let ownerCookies: Map<string, string>;
  let designerCookies: Map<string, string>;

  beforeAll(async () => {
    t = await createTenant();
    owner = await addUser(t, { preset: 'owner', name: 'Roles Owner' });
    designer = await addUser(t, { preset: 'designer', name: 'Roles Designer' });
    ownerCookies = await cookiesFor(owner.email);
    designerCookies = await cookiesFor(designer.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    state.emitted = [];
    state.failEmit = false;
    state.reported = [];
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('the three role events are registered as log_only', () => {
    for (const n of ['role.created', 'role.updated', 'role.deleted'] as const) {
      expect(EVENTS[n].kind, n).toBe('log_only');
    }
  });

  it('401 signed out; 403 without settings_users on GET, POST, PATCH and DELETE', async () => {
    const crew = await roleId(t, 'crew');
    const ok = { name: 'Nope', grantedKeys: [] };
    state.store = new Map();
    for (const res of [await get(), await post(ok), await patch(crew, ok), await remove(crew)]) {
      expect(res.status).toBe(401);
      noStore(res);
    }
    state.store = new Map(designerCookies);
    for (const res of [await get(), await post(ok), await patch(crew, ok), await remove(crew)]) {
      expect(res.status).toBe(403);
      expect(await body(res)).toEqual(err('permission_denied', 'error.not_authorized'));
      noStore(res);
    }
    expect(state.emitted).toEqual([]);
  }, 120000);

  it('GET lists presets then custom roles, each with its holder count', async () => {
    state.store = new Map(ownerCookies);
    const res = await get();
    expect(res.status).toBe(200);
    noStore(res);
    const roles = (await body(res)) as {
      roles: {
        name: string;
        preset: string | null;
        defaultPermissions: string[];
        holders: number;
      }[];
    };
    expect(roles.roles.slice(0, 4).map((r) => r.preset)).toEqual([
      'owner',
      'designer',
      'foreman',
      'crew',
    ]);
    expect(roles.roles[0].holders).toBe(1);
    expect(roles.roles[2].defaultPermissions).toHaveLength(11);
  }, 120000);

  it('400 for a malformed body; blank and taken names refused with their own codes', async () => {
    state.store = new Map(ownerCookies);
    const cases: unknown[] = [
      '{not json',
      { name: 'Bad key', grantedKeys: ['fly_drones'] },
      { name: 'Twice', grantedKeys: ['export', 'export'] },
      { name: 'Too many', grantedKeys: [...PERMISSION_KEYS, 'export'] },
      { name: 'x'.repeat(1001), grantedKeys: [] },
      { name: 'Extra', grantedKeys: [], extra: 1 },
      { grantedKeys: [] },
    ];
    for (const payload of cases) {
      const res = await post(payload);
      expect(res.status, JSON.stringify(payload).slice(0, 80)).toBe(400);
      expect(await body(res)).toEqual(err('invalid_input'));
    }
    const blank = await post({ name: '   ', grantedKeys: [] });
    expect(blank.status).toBe(400);
    expect(await body(blank)).toEqual(err('role_name_required'));
    const taken = await post({ name: 'DESIGNER', grantedKeys: [] });
    expect(taken.status).toBe(400);
    expect(await body(taken)).toEqual(err('role_name_taken'));
    expect(state.emitted).toEqual([]);
  }, 120000);

  it('POST creates (201) and emits role.created; PATCH edits defaults only and emits role.updated; nothing changed emits nothing', async () => {
    state.store = new Map(ownerCookies);
    const created = await post({ name: ' Lead carpenter ', grantedKeys: PRESET_KEYS.foreman });
    expect(created.status).toBe(201);
    const role = ((await body(created)) as { role: { id: string } }).role;
    expect(role).toMatchObject({ name: 'Lead carpenter', preset: null, holders: 0 });
    expect(state.emitted).toEqual([
      {
        name: 'role.created',
        payload: { roleId: role.id, name: 'Lead carpenter' },
        ctx: { tenantId: t, actorId: owner.appUserId },
      },
    ]);

    const holder = await addUser(t, {
      customRoleId: role.id,
      granted: PRESET_KEYS.foreman,
      name: 'Holds Lead',
    });
    state.emitted = [];
    const edited = await patch(role.id, { name: 'Lead carpenter', grantedKeys: ['view_projects'] });
    expect(edited.status).toBe(200);
    expect(await body(edited)).toMatchObject({ fields: ['default_permissions'] });
    expect(state.emitted).toEqual([
      {
        name: 'role.updated',
        payload: { roleId: role.id, fields: ['default_permissions'] },
        ctx: { tenantId: t, actorId: owner.appUserId },
      },
    ]);
    expect((await roleRow(role.id))?.default_permissions).toEqual(['view_projects']);
    const held = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.user_permission
      where membership_id = ${holder.membershipId}::uuid and granted`;
    expect(held[0].n).toBe(11);

    state.emitted = [];
    const same = await patch(role.id, { name: 'Lead carpenter', grantedKeys: ['view_projects'] });
    expect(same.status).toBe(200);
    expect(await body(same)).toMatchObject({ fields: [] });
    expect(state.emitted).toEqual([]);
  }, 120000);

  it('PATCH and DELETE: 404 bad or unknown id, 409 preset, 409 held; DELETE 200 emits role.deleted', async () => {
    state.store = new Map(ownerCookies);
    const ok = { name: 'Anything', grantedKeys: [] };
    for (const res of [await patch('not-a-uuid', ok), await remove('not-a-uuid')]) {
      expect(res.status).toBe(404);
      expect(await body(res)).toEqual(err('role_not_found'));
    }
    const ghost = '00000000-0000-4000-8000-000000000000';
    for (const res of [await patch(ghost, ok), await remove(ghost)]) {
      expect(res.status).toBe(404);
      expect(await body(res)).toEqual(err('role_not_found'));
    }
    const foreman = await roleId(t, 'foreman');
    for (const res of [await patch(foreman, ok), await remove(foreman)]) {
      expect(res.status).toBe(409);
      expect(await body(res)).toEqual(err('role_preset'));
    }

    const made = await post({ name: 'Short lived', grantedKeys: [] });
    const id = ((await body(made)) as { role: { id: string } }).role.id;
    const m = await addUser(t, { customRoleId: id, name: 'Holds Short' });
    state.emitted = [];
    const held = await remove(id);
    expect(held.status).toBe(409);
    expect(await body(held)).toEqual(err('role_in_use'));
    expect(state.emitted).toEqual([]);

    await harnessSql()`update public.membership set role_id = null where id = ${m.membershipId}::uuid`;
    const gone = await remove(id);
    expect(gone.status).toBe(200);
    noStore(gone);
    expect(await body(gone)).toEqual({ removed: true });
    expect(state.emitted).toEqual([
      {
        name: 'role.deleted',
        payload: { roleId: id, name: 'Short lived' },
        ctx: { tenantId: t, actorId: owner.appUserId },
      },
    ]);
    expect(await roleRow(id)).toBeNull();
  }, 120000);

  it('a failed emit is reported and does not fail the create', async () => {
    state.store = new Map(ownerCookies);
    state.failEmit = true;
    const res = await post({ name: 'Emit fails', grantedKeys: [] });
    expect(res.status).toBe(201);
    expect(state.reported).toEqual(['role.created_event_failed']);
  }, 120000);
});
