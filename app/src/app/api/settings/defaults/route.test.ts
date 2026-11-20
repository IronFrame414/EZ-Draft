// EZD-116 (AC-EZD-116-3, -4, -5, -7, -8). next/headers is mocked and members sign in as in
// app/src/app/api/projects/create.test.ts; emit is wrapped in vi.fn. Expected values: Q-0697 decisions 10 (the
// save needs settings_defaults, 403 without it; any active member reads the effective values), 03 (save writes
// only the edited keys; the copy at creation; a project's copy over the company values), S15d Events
// (tenant.defaults_updated), 09o Value checks (percent 100.5, seating limit 1 1/2" over 1 1/2", reminder lead
// not below expiry refused, nothing saved) and Copy at creation rows 1 and 4.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../../server/auth/supabase-server';
import { emit } from '../../../../server/events';

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

const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function patch(body: unknown) {
  const { PATCH } = await import('./route');
  const res = await PATCH(
    new Request('http://localhost/api/settings/defaults', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { res, json: await json(res) };
}

async function get() {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, json: await json(res) };
}

async function createProject(name: string): Promise<string> {
  const { POST } = await import('../../projects/route');
  const res = await POST(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, address: '1 Oak', type: 'kitchen', customerId: null, scopeOfWork: '' }),
    }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { project: { id: string } }).project.id;
}

async function projectDefaults(id: string) {
  const { GET } = await import('../../projects/[id]/defaults/route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/defaults`), {
    params: Promise.resolve({ id }),
  });
  return { res, json: (await json(res)) as { defaults: Record<string, unknown> } };
}

describe('EZD-116 /api/settings/defaults', () => {
  let tenant = '';
  let owner: Member;
  let ownerCookies: Map<string, string>;
  let crewCookies: Map<string, string>;
  const stored = async () =>
    (await harnessSql()`select defaults from public.tenant where id = ${tenant}::uuid`)[0]
      .defaults as Record<string, unknown>;
  const noStore = (res: Response) =>
    expect(res.headers.get('cache-control') ?? '').toContain('no-store');

  beforeAll(async () => {
    tenant = await createTenant();
    owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, [
      'settings_defaults',
      'create_projects',
      'view_projects',
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

  it('AC-3: a member without settings_defaults reads the effective values but the save answers 403', async () => {
    state.store = new Map(crewCookies);
    const r = await get();
    expect(r.res.status).toBe(200);
    noStore(r.res);
    const body = r.json as { stored: object; effective: Record<string, unknown> };
    expect(body.stored).toEqual({});
    expect(body.effective.cabinet_autofill_increment).toBe(3);
    expect(body.effective.seating_support_limit).toBeNull();

    state.store = new Map(crewCookies);
    const p = await patch({ changes: { waste_tile: 10 } });
    expect(p.res.status).toBe(403);
    expect(p.json).toEqual(FORBIDDEN);
    expect(await stored()).toEqual({});
    expect(emitMock).not.toHaveBeenCalled();

    state.store = new Map();
    expect((await get()).res.status).toBe(401);
  });

  it('AC-4: refused values answer 400 with the row and nothing saves', async () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ waste_tile: 100.5 }, 'waste_tile', 'office.defaults.error.percent'],
      [{ edit_lock_auto_release: 1441 }, 'edit_lock_auto_release', 'office.defaults.error.minutes'],
      [{ share_link_expiry: 366 }, 'share_link_expiry', 'office.defaults.error.days'],
      [{ measurement_tolerance: -1 }, 'measurement_tolerance', 'office.length.refused'],
      [{ seating_support_limit: 1.5 }, 'seating_support_limit', 'office.defaults.error.seating_limit'],
      [
        { share_link_reminder_lead: 30 },
        'share_link_reminder_lead',
        'office.defaults.error.reminder_lead',
      ],
    ];
    for (const [changes, key, messageKey] of cases) {
      state.store = new Map(ownerCookies);
      const r = await patch({ changes: { waste_lvp: 7, ...changes } });
      expect(r.res.status, key).toBe(400);
      expect((r.json as { error: { fields: Record<string, string> } }).error.fields).toEqual({
        [key]: messageKey,
      });
    }
    state.store = new Map(ownerCookies);
    expect((await patch({ changes: { not_a_key: 1 } })).res.status).toBe(400);
    state.store = new Map(ownerCookies);
    expect((await patch({ changes: {} })).res.status).toBe(400);
    expect(await stored()).toEqual({});
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('AC-5: save writes only the edited keys and emits tenant.defaults_updated; nothing changed emits nothing', async () => {
    state.store = new Map(ownerCookies);
    const a = await patch({ changes: { waste_tile: 10, measurement_tolerance: 0.125 } });
    expect(a.res.status).toBe(200);
    noStore(a.res);
    expect((a.json as { stored: object }).stored).toEqual({
      waste_tile: 10,
      measurement_tolerance: 0.125,
    });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'tenant.defaults_updated',
      { keys: ['measurement_tolerance', 'waste_tile'] },
      { tenantId: tenant, actorId: owner.appUserId },
    );

    emitMock.mockClear();
    state.store = new Map(ownerCookies);
    const b = await patch({ changes: { measurement_tolerance: null } });
    expect(b.res.status).toBe(200);
    expect(await stored()).toEqual({ waste_tile: 10 });
    expect(emitMock).toHaveBeenCalledWith(
      'tenant.defaults_updated',
      { keys: ['measurement_tolerance'] },
      { tenantId: tenant, actorId: owner.appUserId },
    );

    emitMock.mockClear();
    state.store = new Map(ownerCookies);
    expect((await patch({ changes: { waste_tile: 10 } })).res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('AC-7, AC-8: a new project keeps its own copy; a company change reaches new projects and the uncopied keys only', async () => {
    state.store = new Map(ownerCookies);
    expect((await patch({ changes: { waste_tile: 10, pattern_straight: 2 } })).res.status).toBe(200);
    state.store = new Map(ownerCookies);
    const p1 = await createProject('P1');
    const s1 = (
      await harnessSql()`select settings from public.project where id = ${p1}::uuid`
    )[0].settings as { defaults: Record<string, number> };
    expect(s1.defaults).toEqual({
      waste_tile: 10,
      overhang_standard: 1.5,
      overhang_seating_counter: 12,
      overhang_seating_bar: 10,
      overhang_against_wall: 0,
      cabinet_autofill_increment: 3,
      countertop_increment: 0.5,
    });

    state.store = new Map(ownerCookies);
    expect((await patch({ changes: { waste_tile: 12, pattern_straight: 4 } })).res.status).toBe(200);
    state.store = new Map(ownerCookies);
    const p2 = await createProject('P2');

    state.store = new Map(ownerCookies);
    const d1 = await projectDefaults(p1);
    expect(d1.res.status).toBe(200);
    expect(d1.json.defaults.waste_tile).toBe(10);
    expect(d1.json.defaults.pattern_straight).toBe(4);
    state.store = new Map(ownerCookies);
    const d2 = await projectDefaults(p2);
    expect(d2.json.defaults.waste_tile).toBe(12);

    // the model load carries the same effective defaults (the editor session's values)
    state.store = new Map(ownerCookies);
    const { GET } = await import('../../projects/[id]/model/route');
    const m = await GET(new Request(`http://localhost/api/projects/${p1}/model`), {
      params: Promise.resolve({ id: p1 }),
    });
    expect(m.status).toBe(200);
    const model = (await m.json()) as { defaults: Record<string, unknown> };
    expect(model.defaults).toEqual(d1.json.defaults);

    // a key unset at creation reads the company value live (Q-0697 03)
    state.store = new Map(ownerCookies);
    expect((await patch({ changes: { waste_lvp: 8 } })).res.status).toBe(200);
    state.store = new Map(ownerCookies);
    expect((await projectDefaults(p1)).json.defaults.waste_lvp).toBe(8);

    // a project out of reach is not found
    state.store = new Map(ownerCookies);
    expect((await projectDefaults('00000000-0000-4000-8000-000000000000')).res.status).toBe(404);
  });

  // EZD-222 (S15d Keyboard shortcuts "Keys are checked for collisions within the same view"; phase-02.md EZD-222
  // "Already used by check, browser keys refused"): the server refuses what the table refuses.
  it('EZD-222: a key used twice in a view or kept by the browser is refused; a free key saves and loads', async () => {
    for (const map of [{ wall: 'R' }, { wall: 'Mod+W' }, { nope: 'B' }, { wall: 'b' }]) {
      state.store = new Map(ownerCookies);
      const r = await patch({ changes: { keyboard_shortcuts: map } });
      expect(r.res.status, JSON.stringify(map)).toBe(400);
      expect((r.json as { error: { fields: Record<string, string> } }).error.fields).toEqual({
        keyboard_shortcuts: 'office.defaults.error.shortcuts',
      });
    }
    state.store = new Map(ownerCookies);
    expect((await patch({ changes: { keyboard_shortcuts: { wall: 'B' } } })).res.status).toBe(200);
    expect((await stored()).keyboard_shortcuts).toEqual({ wall: 'B' });
    state.store = new Map(ownerCookies);
    const r = await get();
    expect((r.json as { effective: Record<string, unknown> }).effective.keyboard_shortcuts).toEqual({ wall: 'B' });
  });
});
