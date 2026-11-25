// EZD-709 (AC-EZD-709-1, AC-EZD-709-2). next/headers is mocked and members sign in as in
// app/src/app/api/settings/code-edition/route.test.ts; emit is wrapped in vi.fn. Expected values: S15b (Save
// "Saves tenant.title_block"; Events tenant.title_block_updated; Decision 1 the company switch is the only
// setting; Validation: missing company name and license listed), S15b Permissions (settings_title_block, 403
// without it).
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
    new Request('http://localhost/api/settings/title-block', {
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

const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };

describe('EZD-709 /api/settings/title-block', () => {
  let tenant = '';
  let ownerCookies: Map<string, string>;
  let crewCookies: Map<string, string>;
  const row = async () =>
    (await harnessSql()`select name, title_block from public.tenant where id = ${tenant}::uuid`)[0];

  beforeAll(async () => {
    tenant = await createTenant();
    const owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['settings_title_block', 'view_projects']);
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

  it('GET: 401 signed out; any member reads the switch (on), the company fields and no license', async () => {
    expect((await get()).res.status).toBe(401);
    state.store = new Map(crewCookies);
    const r = await get();
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(r.json).toEqual({
      config: { showCompany: true },
      company: { name: (await row()).name, licenseNo: null, contact: {}, logoUrl: null },
      codeEdition: null,
    });
  });

  it('PATCH: 403 without settings_title_block; 400 for a bad body; nothing saved', async () => {
    state.store = new Map(crewCookies);
    const denied = await patch({ showCompany: false });
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual(FORBIDDEN);
    state.store = new Map(ownerCookies);
    for (const bad of ['{', {}, { showCompany: 'off' }, { showCompany: false, layout: 'x' }, null]) {
      const r = await patch(bad);
      expect(r.res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await row()).title_block).toEqual({});
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('PATCH: switching the company block off saves and emits tenant.title_block_updated; the same value emits nothing', async () => {
    state.store = new Map(ownerCookies);
    const saved = await patch({ showCompany: false });
    expect(saved.res.status).toBe(200);
    expect(saved.json).toEqual({ showCompany: false });
    expect((await row()).title_block).toEqual({ show_company: false });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('tenant.title_block_updated');
    expect(emitMock.mock.calls[0][1]).toEqual({ keys: ['show_company'] });
    expect(emitMock.mock.calls[0][2]).toMatchObject({ tenantId: tenant });

    emitMock.mockClear();
    state.store = new Map(ownerCookies);
    const same = await patch({ showCompany: false });
    expect(same.res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();

    state.store = new Map(crewCookies);
    expect(((await get()).json as { config: unknown }).config).toEqual({ showCompany: false });
  });
});
