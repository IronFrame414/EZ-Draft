// EZD-130 (AC-EZD-130-2, -3, -4, -5, -6). Same sign-in and mocks as app/src/app/api/projects/[id]/plan-scale/
// route.test.ts and the emit wrapper of app/src/app/api/projects/create.test.ts. Expected values: Q-0697 decisions
// 03 and 10 (contact only to Company settings, Create projects or Send to client; type and defaults need the
// lock; a project with no copy reads the company value and a save with the lock stores a copy, 09o Copy at
// creation row 3); 09o Value checks rows 1 and 4 (percent -1 and 100.5 refused; a seating limit equal to the
// standard overhang refused); Q-0399 (no code edition); project.updated { projectId, keys } (Q-0697 03).
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
  signIn,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import { emit } from '../../../../../server/events';
import type { ProjectSettings } from '../../../../../lib/projects/project-settings';

vi.mock('../../../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/events')>();
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

async function call(
  method: 'GET' | 'PATCH',
  id: string,
  body?: unknown,
): Promise<{ res: Response; json: unknown }> {
  const route = await import('./route');
  const init: RequestInit =
    method === 'GET'
      ? { method }
      : {
          method,
          headers: { 'content-type': 'application/json' },
          body: typeof body === 'string' ? body : JSON.stringify(body),
        };
  const res = await route[method](new Request(`http://localhost/api/projects/${id}/settings`, init), {
    params: Promise.resolve({ id }),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  return { res, json };
}

const codeOf = (json: unknown) => (json as { error?: { code?: string } }).error?.code;
const fieldsOf = (json: unknown) => (json as { error?: { fields?: unknown } }).error?.fields;

describe('EZD-130 project settings route', () => {
  let tenant = '';
  let project = '';
  let bare = '';
  let otherProject = '';
  let customer = '';
  let holderId = '';
  let holderCookies: Map<string, string>;
  let editorCookies: Map<string, string>;
  let viewerCookies: Map<string, string>;
  let senderCookies: Map<string, string>;
  let holderEmail = '';
  const settings = async (id: string) =>
    (await harnessSql()`select settings from public.project where id = ${id}::uuid`)[0].settings;

  beforeAll(async () => {
    tenant = await createTenant();
    const otherTenant = await createTenant();
    [project, bare] = await createProjects(tenant, 2);
    [otherProject] = await createProjects(otherTenant, 1);
    customer = (
      await harnessSql()`insert into public.customer (tenant_id, name, email, phone)
        values (${tenant}::uuid, 'Ann Lee', 'ann@example.com', '555-0100') returning id`
    )[0].id as string;
    await harnessSql()`update public.project set customer_id = ${customer}::uuid,
      settings = '{"defaults":{"waste_tile":10,"overhang_standard":1.5}}'::jsonb where id = ${project}::uuid`;
    await harnessSql()`update public.tenant set defaults = '{"waste_tile":12,"seating_support_limit":12}'::jsonb
      where id = ${tenant}::uuid`;
    const holder = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, holder.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    const sender = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, sender.membershipId, ['view_projects', 'send_to_client']);
    holderId = holder.appUserId;
    holderEmail = holder.email;
    holderCookies = await cookiesFor(holder.email);
    editorCookies = await cookiesFor(editor.email);
    viewerCookies = await cookiesFor(viewer.email);
    senderCookies = await cookiesFor(sender.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    emitMock.mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  const acquire = async (id: string): Promise<number> => {
    const s = await signIn(holderEmail);
    const r = await s.serverDb.rpc('acquire_edit_lock', { p_project: id, p_device_id: 'device-ezd130' });
    return (r.data as { lock_epoch: number }).lock_epoch;
  };

  it('GET: 401, 404, and the read with contact only for Company settings, Create projects or Send to client (AC-4)', async () => {
    state.store = new Map();
    expect((await call('GET', project)).res.status).toBe(401);

    state.store = new Map(viewerCookies);
    expect(codeOf((await call('GET', 'not-a-uuid')).json)).toBe('project_not_found');
    expect((await call('GET', otherProject)).res.status).toBe(404);

    const v = await call('GET', project);
    expect(v.res.status).toBe(200);
    expect(v.res.headers.get('cache-control')).toBe('no-store');
    const read = v.json as ProjectSettings;
    expect(read.client).toEqual({ id: customer, name: 'Ann Lee' });
    expect(read.can).toEqual({ details: false, client: false, typeAndDefaults: false });
    // the project's copy wins; a key it lacks reads the company value; Not set is null
    expect(read.defaults.waste_tile).toBe(10);
    expect(read.defaults.overhang_standard).toBe(1.5);
    expect(read.defaults.waste_lvp).toBeNull();
    expect(Object.keys(read.defaults)).not.toContain('pattern_straight');
    // AC-5: no code edition or submittal profile in the read
    expect(Object.keys(read.project).sort()).toEqual([
      'address',
      'id',
      'name',
      'scopeOfWork',
      'scopeTrades',
      'type',
    ]);

    state.store = new Map(senderCookies);
    expect(((await call('GET', project)).json as ProjectSettings).client).toEqual({
      id: customer,
      name: 'Ann Lee',
      email: 'ann@example.com',
      phone: '555-0100',
    });
    state.store = new Map(holderCookies);
    const h = (await call('GET', project)).json as ProjectSettings;
    expect(h.client?.email).toBe('ann@example.com');
    expect(h.can).toEqual({ details: true, client: true, typeAndDefaults: true });
    state.store = new Map(editorCookies);
    const e = (await call('GET', project)).json as ProjectSettings;
    expect(e.client).toEqual({ id: customer, name: 'Ann Lee' });
    expect(e.can).toEqual({ details: true, client: false, typeAndDefaults: true });

    // AC-2: a project with no copy reads the company value live
    expect(((await call('GET', bare)).json as ProjectSettings).defaults.waste_tile).toBe(12);
  });

  it('PATCH: refuses no permission, bad bodies and values; validation as the New project dialog (AC-5, AC-6)', async () => {
    state.store = new Map(viewerCookies);
    const denied = await call('PATCH', project, { name: 'X' });
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });

    state.store = new Map(editorCookies);
    expect((await call('PATCH', otherProject, { name: 'X' })).res.status).toBe(404);
    for (const bad of ['{', [1], { codeEdition: 'FBC 2023' }, { submittalProfileId: null }, { type: 'garage' },
      { customerId: 'nope' }, { defaults: { pattern_straight: 5 } }, { lockEpoch: -1 }]) {
      const r = await call('PATCH', project, bad);
      expect(r.res.status, JSON.stringify(bad)).toBe(400);
      expect(codeOf(r.json)).toBe('invalid_input');
    }
    const blank = await call('PATCH', project, { name: '  ', address: '' });
    expect(blank.res.status).toBe(400);
    expect(fieldsOf(blank.json)).toEqual({
      name: 'office.project_settings.name_required',
      address: 'office.project_settings.address_required',
    });
    // 09o Value checks row 1: percent -1 and 100.5 refused
    for (const v of [-1, 100.5]) {
      const r = await call('PATCH', project, { defaults: { waste_tile: v } });
      expect(fieldsOf(r.json)).toEqual({ waste_tile: 'office.defaults.error.percent' });
    }
    expect(await settings(project)).toEqual({ defaults: { waste_tile: 10, overhang_standard: 1.5 } });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('PATCH: name without the lock; type and defaults 409 without it; a save emits project.updated (AC-3, AC-6)', async () => {
    state.store = new Map(editorCookies);
    const r = await call('PATCH', project, { name: 'Lee kitchen' });
    expect(r.res.status).toBe(200);
    expect((r.json as ProjectSettings).project.name).toBe('Lee kitchen');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('project.updated');
    expect(emitMock.mock.calls[0][1]).toEqual({ projectId: project, keys: ['name'] });
    expect(emitMock.mock.calls[0][2]).toMatchObject({ tenantId: tenant, projectId: project });

    emitMock.mockClear();
    const t = await call('PATCH', project, { type: 'bath' });
    expect(t.res.status).toBe(409);
    expect(codeOf(t.json)).toBe('stale_lock_epoch');
    const d = await call('PATCH', project, { defaults: { waste_tile: 15 }, lockEpoch: 0 });
    expect(d.res.status).toBe(409);
    expect(emitMock).not.toHaveBeenCalled();
    // a client change needs Company settings or Create projects
    const c = await call('PATCH', project, { customerId: null });
    expect(c.res.status).toBe(403);
  });

  it('PATCH with the lock: 15% changes only this project; a project with no copy stores one (AC-2); seating rule (09o row 4)', async () => {
    state.store = new Map(holderCookies);
    const epoch = await acquire(project);
    const r = await call('PATCH', project, { defaults: { waste_tile: 15 }, lockEpoch: epoch });
    expect(r.res.status).toBe(200);
    expect((r.json as ProjectSettings).defaults.waste_tile).toBe(15);
    // the keys changed: tile waste, and the copies the save stored for keys the project lacked (09o row 3);
    // never the unchanged standard overhang or a key Not set at the company (vinyl plank waste)
    const keys = (emitMock.mock.calls[0][1] as { keys: string[] }).keys;
    expect(keys).toContain('waste_tile');
    expect(keys).not.toContain('overhang_standard');
    expect(keys).not.toContain('waste_lvp');
    expect(await settings(bare)).toEqual({});
    const company = (await harnessSql()`select defaults from public.tenant where id = ${tenant}::uuid`)[0];
    expect(company.defaults).toEqual({ waste_tile: 12, seating_support_limit: 12 });

    // a standard overhang equal to the company's seating limit (12") is refused on the overhang
    const s = await call('PATCH', project, { defaults: { overhang_standard: 12 }, lockEpoch: epoch });
    expect(s.res.status).toBe(400);
    expect(fieldsOf(s.json)).toEqual({ overhang_standard: 'office.defaults.error.seating_limit' });

    // the project with no copy: a save carrying the lock stores the company's values it lacks
    const bareEpoch = await acquire(bare);
    const b = await call('PATCH', bare, { name: 'Bare kitchen', lockEpoch: bareEpoch });
    expect(b.res.status).toBe(200);
    const copy = ((await settings(bare)) as { defaults: Record<string, number> }).defaults;
    expect(copy.waste_tile).toBe(12);
    expect(copy.overhang_standard).toBe(1.5);
    expect(copy).not.toHaveProperty('waste_lvp');
    expect(copy).not.toHaveProperty('pattern_straight');
    expect(holderId).not.toBe('');
  });
});
