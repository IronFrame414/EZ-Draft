// EZD-614 (S15e Appliance rating defaults, Save, Events emitted "catalog.settings_updated (new)"; Q-0766;
// AC-EZD-614-1). next/headers is mocked and members sign in as in ../code-edition/route.test.ts; emit is wrapped in
// vi.fn. Expected values: S15e Permissions (the page's own switch, settings_catalog: 403 without it), the migration
// header (volts 120 or 240, amps above 0 in hundredths, one row per type, a company starts with none) and 09s rows 7
// and 1 (dishwasher 120 V 10 A; range 240 V 48.75 A).
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

async function put(body: unknown) {
  const { PUT } = await import('./route');
  const res = await PUT(
    new Request('http://localhost/api/settings/appliance-ratings', {
      method: 'PUT',
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
const DW = { applianceType: 'dishwasher', name: 'Dishwasher', volts: 120, amps: 10 };
const RANGE = { applianceType: 'range', name: 'Range, electric', volts: 240, amps: 48.75 };

describe('EZD-614 /api/settings/appliance-ratings', () => {
  let tenant = '';
  let ownerCookies: Map<string, string>;
  let crewCookies: Map<string, string>;
  const stored = async () =>
    (
      await harnessSql()`select appliance_type, volts, amps::text as amps from public.appliance_rating_default
        where tenant_id = ${tenant}::uuid order by appliance_type`
    ).map((r) => ({ ...r }));

  beforeAll(async () => {
    tenant = await createTenant();
    const owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['settings_catalog', 'view_projects']);
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

  it('GET: 401 signed out; any member reads the list, empty for a new company', async () => {
    expect((await get()).res.status).toBe(401);
    state.store = new Map(crewCookies);
    const r = await get();
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(r.json).toEqual({ rows: [] });
  });

  it('PUT: 403 without settings_catalog; 400 for a bad body; nothing saved, no event', async () => {
    state.store = new Map(crewCookies);
    const denied = await put({ rows: [DW] });
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual(FORBIDDEN);
    state.store = new Map(ownerCookies);
    for (const bad of [
      '{',
      {},
      [DW],
      { rows: [DW], other: 1 },
      { rows: [{ ...DW, volts: 208 }] },
      { rows: [{ ...DW, amps: 0 }] },
      { rows: [{ ...DW, amps: 10.125 }] },
      { rows: [{ ...DW, amps: '10' }] },
      { rows: [{ ...DW, name: ' ' }] },
      { rows: [{ ...DW, applianceType: 'toaster' }] },
      { rows: [DW, { ...DW, name: 'Again' }] },
      { rows: [{ ...DW, extra: true }] },
    ]) {
      const r = await put(bad);
      expect(r.res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await stored()).toEqual([]);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('PUT: saves the list, answers it in the Add order and emits catalog.settings_updated once with the types', async () => {
    state.store = new Map(ownerCookies);
    const saved = await put({ rows: [DW, RANGE] });
    expect(saved.res.status).toBe(200);
    expect(saved.json).toEqual({ rows: [RANGE, DW] });
    expect(await stored()).toEqual([
      { appliance_type: 'dishwasher', volts: 120, amps: '10.00' },
      { appliance_type: 'range', volts: 240, amps: '48.75' },
    ]);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('catalog.settings_updated');
    expect(emitMock.mock.calls[0][1]).toEqual({
      section: 'appliance_ratings',
      applianceTypes: ['dishwasher', 'range'],
    });
    expect(emitMock.mock.calls[0][2]).toMatchObject({ tenantId: tenant });

    state.store = new Map(crewCookies);
    expect((await get()).json).toEqual({ rows: [RANGE, DW] });
  });

  it('PUT: the same list again emits nothing; removing a row deletes it', async () => {
    state.store = new Map(ownerCookies);
    const same = await put({ rows: [RANGE, DW] });
    expect(same.res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();
    const removed = await put({ rows: [DW] });
    expect(removed.json).toEqual({ rows: [DW] });
    expect(emitMock.mock.calls[0][1]).toEqual({
      section: 'appliance_ratings',
      applianceTypes: ['range'],
    });
    expect(await stored()).toEqual([{ appliance_type: 'dishwasher', volts: 120, amps: '10.00' }]);
  });
});
