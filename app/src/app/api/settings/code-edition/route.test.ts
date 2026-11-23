// EZD-613 (AC-EZD-613-1). next/headers is mocked and members sign in as in app/src/app/api/settings/defaults/
// route.test.ts; emit is wrapped in vi.fn. Expected values: S15g (Save "Existing projects keep their own
// edition"; Events tenant.code_edition_updated; the v1 edition FBC 9th ed. with NEC 2023, Q-0220), Q-0210 (the
// save needs settings_code_edition, 403 without it), S15g Decision 2 (the project's own edition is set in
// Project settings).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../../server/auth/supabase-server';
import { emit } from '../../../../server/events';
import type { ProjectSettings } from '../../../../lib/projects/project-settings';

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

async function patch(body: unknown) {
  const { PATCH } = await import('./route');
  const res = await PATCH(
    new Request('http://localhost/api/settings/code-edition', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  return { res, json: await json(res) };
}

async function get() {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, json: await json(res) };
}

async function projectSettings(method: 'GET' | 'PATCH', id: string, body?: unknown) {
  const route = await import('../../projects/[id]/settings/route');
  const init: RequestInit =
    method === 'GET'
      ? { method }
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  const res = await route[method](new Request(`http://localhost/api/projects/${id}/settings`, init), {
    params: Promise.resolve({ id }),
  });
  return { res, json: (await json(res)) as ProjectSettings };
}

const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };

describe('EZD-613 /api/settings/code-edition', () => {
  let tenant = '';
  let kept = '';
  let unset = '';
  let ownerCookies: Map<string, string>;
  let crewCookies: Map<string, string>;
  const projectEditionRow = async (id: string) =>
    (await harnessSql()`select code_edition, updated_at from public.project where id = ${id}::uuid`)[0];

  beforeAll(async () => {
    tenant = await createTenant();
    [kept, unset] = await createProjects(tenant, 2);
    const owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, [
      'settings_code_edition',
      'view_projects',
      'edit_model',
    ]);
    const crew = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, crew.membershipId, ['view_projects', 'edit_model']);
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

  it('GET: 401 signed out; any member reads the default (FBC 9th ed. · NEC 2023), the switch off and the rule sets', async () => {
    expect((await get()).res.status).toBe(401);
    state.store = new Map(crewCookies);
    const r = await get();
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(r.json).toEqual({
      edition: 'fbc9_nec2023',
      optionalLoadCalc: false,
      available: ['fbc9_nec2023', 'fbc8_nec2020'],
    });
  });

  it('PATCH: 403 without settings_code_edition; 400 for a bad body; nothing saved', async () => {
    state.store = new Map(crewCookies);
    const denied = await patch({ optionalLoadCalc: true });
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual(FORBIDDEN);
    state.store = new Map(ownerCookies);
    for (const bad of ['{', {}, { edition: 'FBC 2023' }, { optionalLoadCalc: 'on' }, { other: 1 }]) {
      const r = await patch(bad);
      expect(r.res.status, JSON.stringify(bad)).toBe(400);
    }
    const t = (await harnessSql()`select code_edition, defaults from public.tenant where id = ${tenant}::uuid`)[0];
    expect([t.code_edition, t.defaults]).toEqual([null, {}]);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('AC-EZD-613-1: a project keeps its edition after the default changes', async () => {
    // The project gets its own edition in Project settings.
    state.store = new Map(ownerCookies);
    const own = await projectSettings('PATCH', kept, { codeEdition: 'fbc8_nec2020' });
    expect(own.res.status).toBe(200);
    expect(own.json.codeEdition).toEqual({ own: 'fbc8_nec2020', effective: 'fbc8_nec2020', auto: false });
    expect(emitMock.mock.calls[0][1]).toEqual({ projectId: kept, keys: ['code_edition'] });
    emitMock.mockClear();
    const keptBefore = await projectEditionRow(kept);
    const unsetBefore = await projectEditionRow(unset);

    // The default changes.
    state.store = new Map(ownerCookies);
    const saved = await patch({ edition: 'fbc9_nec2023', optionalLoadCalc: true });
    expect(saved.res.status).toBe(200);
    expect(saved.json).toEqual({
      edition: 'fbc9_nec2023',
      optionalLoadCalc: true,
      available: ['fbc9_nec2023', 'fbc8_nec2020'],
    });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('tenant.code_edition_updated');
    expect(emitMock.mock.calls[0][1]).toEqual({ keys: ['code_edition', 'optional_load_calc'] });
    expect(emitMock.mock.calls[0][2]).toMatchObject({ tenantId: tenant });

    // The projects are untouched; the one with its own edition still has it.
    expect(await projectEditionRow(kept)).toEqual(keptBefore);
    expect(await projectEditionRow(unset)).toEqual(unsetBefore);
    state.store = new Map(ownerCookies);
    expect((await projectSettings('GET', kept)).json.codeEdition).toEqual({
      own: 'fbc8_nec2020',
      effective: 'fbc8_nec2020',
      auto: false,
    });
    state.store = new Map(ownerCookies);
    // EZD-643: a new project stores the company default's edition.
    expect((await projectSettings('GET', unset)).json.codeEdition).toEqual({
      own: 'fbc9_nec2023',
      effective: 'fbc9_nec2023',
      auto: false,
    });

    // Saving the same values changes nothing and emits nothing.
    emitMock.mockClear();
    state.store = new Map(ownerCookies);
    expect((await patch({ edition: 'fbc9_nec2023' })).res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('Project settings refuses an edition outside the list (400)', async () => {
    state.store = new Map(ownerCookies);
    const r = await projectSettings('PATCH', unset, { codeEdition: 'FBC 2023' });
    expect(r.res.status).toBe(400);
    expect((await projectEditionRow(unset)).code_edition).toBe('fbc9_nec2023');
  });
});
