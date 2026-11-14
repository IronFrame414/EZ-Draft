// EZD-106 member write routes (AC-EZD-106-4, -6, -8; AC-2 refusal code). next/headers is mocked and members sign
// in as in app/src/app/api/settings/users/route.test.ts. emit is a spy over the real registry check. Expected
// values: Q-0695 decisions 10 rows 59 (settings_users for every write; 403 otherwise), 60
// (last_settings_users_holder), 62 (Deactivate, Reactivate refused when active elsewhere, Remove); Q-0706
// decisions 03 row 50 (user_permission.updated, user.deactivated, user.reactivated, user.removed, log_only);
// architecture "Errors and logging" (401 not_signed_in, 403 permission_denied / error.not_authorized, 400
// invalid_input, 404, 409; Cache-Control no-store).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import { addUser, PRESET_KEYS, roleId } from '../../../../../../test-harness/users/fixtures';
import { EVENTS } from '../../../../../lib/events/registry';
import { PERMISSION_KEYS } from '../../../../../lib/permissions/catalog';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';

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

vi.mock('../../../../../server/events', () => ({
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

async function patch(id: string, payload: unknown): Promise<Response> {
  const { PATCH } = await import('./route');
  return PATCH(
    new Request(`${BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }),
    params(id),
  );
}
async function remove(id: string): Promise<Response> {
  const { DELETE } = await import('./route');
  return DELETE(new Request(`${BASE}/${id}`, { method: 'DELETE' }), params(id));
}
async function post(kind: 'deactivate' | 'reactivate', id: string): Promise<Response> {
  const mod =
    kind === 'deactivate' ? await import('./deactivate/route') : await import('./reactivate/route');
  return mod.POST(new Request(`${BASE}/${id}/${kind}`, { method: 'POST' }), params(id));
}

async function statusOf(membershipId: string): Promise<string | null> {
  const rows = await harnessSql()<{ status: string }[]>`
    select status from public.membership where id = ${membershipId}::uuid`;
  return rows[0]?.status ?? null;
}

describe('EZD-106 member write routes', () => {
  let t: string;
  let owner: Member;
  let designer: Member;
  let ownerCookies: Map<string, string>;
  let designerCookies: Map<string, string>;

  beforeAll(async () => {
    t = await createTenant();
    owner = await addUser(t, { preset: 'owner', name: 'Route Owner' });
    designer = await addUser(t, { preset: 'designer', name: 'Route Designer' });
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

  it('the four events are registered as log_only', () => {
    for (const n of [
      'user_permission.updated',
      'user.deactivated',
      'user.reactivated',
      'user.removed',
    ] as const) {
      expect(EVENTS[n].kind, n).toBe('log_only');
    }
  });

  it('401 signed out, 403 without settings_users on every write, 404 malformed id', async () => {
    const c = await addUser(t, { preset: 'crew', name: 'Target Crew' });
    const crewRole = await roleId(t, 'crew');
    const okBody = { roleId: crewRole, language: 'en', grantedKeys: [] };

    state.store = new Map();
    const a = await patch(c.membershipId, okBody);
    expect(a.status).toBe(401);
    noStore(a);

    state.store = new Map(designerCookies);
    for (const res of [
      await patch(c.membershipId, okBody),
      await remove(c.membershipId),
      await post('deactivate', c.membershipId),
      await post('reactivate', c.membershipId),
    ]) {
      expect(res.status).toBe(403);
      expect(await body(res)).toEqual(err('permission_denied', 'error.not_authorized'));
      noStore(res);
    }

    state.store = new Map(ownerCookies);
    const bad = await patch('not-a-uuid', okBody);
    expect(bad.status).toBe(404);
    expect(await body(bad)).toEqual(err('member_not_found'));
    expect(await statusOf(c.membershipId)).toBe('active');
    expect(state.emitted).toEqual([]);
  }, 120000);

  it('400 for a malformed body: not JSON, an unknown key, a duplicate key, 38 keys, a bad language', async () => {
    const c = await addUser(t, { preset: 'crew', name: 'Body Crew' });
    const crewRole = await roleId(t, 'crew');
    state.store = new Map(ownerCookies);
    const cases: unknown[] = [
      '{not json',
      { roleId: crewRole, language: 'en', grantedKeys: ['fly_drones'] },
      { roleId: crewRole, language: 'en', grantedKeys: ['export', 'export'] },
      { roleId: crewRole, language: 'en', grantedKeys: [...PERMISSION_KEYS, 'export'] },
      { roleId: crewRole, language: 'fr', grantedKeys: [] },
      { roleId: 'x', language: 'en', grantedKeys: [] },
      { roleId: crewRole, language: 'en', grantedKeys: [], extra: 1 },
    ];
    for (const payload of cases) {
      const res = await patch(c.membershipId, payload);
      expect(res.status, JSON.stringify(payload)).toBe(400);
      expect(await body(res)).toEqual(err('invalid_input'));
    }
  }, 120000);

  it('Save writes the switches, role and language and emits user_permission.updated and user.language_changed', async () => {
    const f = await addUser(t, { preset: 'foreman', name: 'Save Foreman', language: 'en' });
    state.store = new Map(ownerCookies);
    const granted = [...PRESET_KEYS.foreman, 'see_company_costs'];
    const res = await patch(f.membershipId, {
      roleId: await roleId(t, 'foreman'),
      language: 'es',
      grantedKeys: granted,
    });
    expect(res.status).toBe(200);
    noStore(res);
    expect(await body(res)).toEqual({
      membershipId: f.membershipId,
      changedKeys: ['see_company_costs'],
      roleChanged: false,
      languageChanged: true,
    });
    expect(state.emitted.map((e) => e.name)).toEqual([
      'user_permission.updated',
      'user.language_changed',
    ]);
    expect(state.emitted[0].payload).toEqual({
      membershipId: f.membershipId,
      appUserId: f.appUserId,
      changedKeys: ['see_company_costs'],
      roleId: await roleId(t, 'foreman'),
      roleChanged: false,
    });
    expect(state.emitted[0].ctx).toEqual({ tenantId: t, actorId: owner.appUserId });
    expect(state.emitted[1].payload).toEqual({ appUserId: f.appUserId, language: 'es' });

    // A Save with nothing changed writes nothing and emits nothing.
    state.emitted = [];
    const again = await patch(f.membershipId, {
      roleId: await roleId(t, 'foreman'),
      language: 'es',
      grantedKeys: granted,
    });
    expect(again.status).toBe(200);
    expect(state.emitted).toEqual([]);
  }, 120000);

  it('the last holder is refused with 409 last_settings_users_holder', async () => {
    const t2 = await createTenant();
    const only = await addUser(t2, { preset: 'owner', name: 'Only Holder' });
    state.store = new Map(await cookiesFor(only.email));
    const res = await post('deactivate', only.membershipId);
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual(err('last_settings_users_holder'));
    const off = await patch(only.membershipId, {
      roleId: await roleId(t2, 'owner'),
      language: 'en',
      grantedKeys: PERMISSION_KEYS.filter((k) => k !== 'settings_users'),
    });
    expect(off.status).toBe(409);
    expect(await body(off)).toEqual(err('last_settings_users_holder'));
    expect(state.emitted).toEqual([]);
  }, 120000);

  it('Deactivate, Reactivate and Remove answer 200 and emit their events; a second Deactivate is 409', async () => {
    const m = await addUser(t, { preset: 'crew', name: 'Life Crew' });
    state.store = new Map(ownerCookies);
    const d = await post('deactivate', m.membershipId);
    expect(d.status).toBe(200);
    expect(await body(d)).toEqual({ membershipId: m.membershipId });
    expect(await statusOf(m.membershipId)).toBe('deactivated');
    const d2 = await post('deactivate', m.membershipId);
    expect(d2.status).toBe(409);
    expect(await body(d2)).toEqual(err('member_state'));
    const r = await post('reactivate', m.membershipId);
    expect(r.status).toBe(200);
    expect(await statusOf(m.membershipId)).toBe('active');
    const x = await remove(m.membershipId);
    expect(x.status).toBe(200);
    expect(await statusOf(m.membershipId)).toBeNull();
    expect(state.emitted.map((e) => [e.name, e.payload])).toEqual([
      ['user.deactivated', { membershipId: m.membershipId, appUserId: m.appUserId }],
      ['user.reactivated', { membershipId: m.membershipId, appUserId: m.appUserId }],
      ['user.removed', { membershipId: m.membershipId, appUserId: m.appUserId }],
    ]);
    const gone = await remove(m.membershipId);
    expect(gone.status).toBe(404);
    expect(await body(gone)).toEqual(err('member_not_found'));
  }, 120000);

  it('Reactivate while active in another company is 409 active_elsewhere', async () => {
    const other = await createTenant();
    const p = await addUser(t, { preset: 'crew', status: 'deactivated', name: 'Elsewhere' });
    await harnessSql()`insert into public.membership (tenant_id, user_id, status, scope)
      values (${other}::uuid, ${p.appUserId}::uuid, 'active', 'all')`;
    state.store = new Map(ownerCookies);
    const res = await post('reactivate', p.membershipId);
    expect(res.status).toBe(409);
    expect(await body(res)).toEqual(err('active_elsewhere'));
  }, 120000);
});
