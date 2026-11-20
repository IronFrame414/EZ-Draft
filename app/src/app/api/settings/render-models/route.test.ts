// EZD-1102 (AC-EZD-1102-1). next/headers is mocked and members sign in as in app/src/app/api/settings/code-edition/
// route.test.ts; emit is wrapped in vi.fn. Expected values: S15f (Validation "Each tier must have a model
// selected"; Permissions: the page switch settings_render_models, Q-0210; dollar figures only with See company
// costs, 13b R2; Events render.model_config_updated), assumptions EZD-1102 (no default model: every tier starts
// empty) and the model list in app/src/lib/render-settings/models.ts.
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
import type { RenderModelsSettings } from '../../../../lib/render-settings/models';

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
    new Request('http://localhost/api/settings/render-models', {
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
  return { res, json: (await json(res)) as RenderModelsSettings & { error?: unknown } };
}

const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const REQUIRED = { error: { code: 'tier_model_required', message_key: 'error.tier_model_required' } };

const ALL_TIERS = [
  { tier: 'fast', model: 'gemini-3.1-flash-lite-image-1k', costUsdPerRender: 0.03 },
  { tier: 'standard', model: 'gemini-3.1-flash-image-1k', costUsdPerRender: 0.06 },
  { tier: 'photoreal', model: 'gemini-3.1-flash-image-4k', costUsdPerRender: 0.14 },
];

describe('EZD-1102 /api/settings/render-models', () => {
  let tenant = '';
  let ownerCookies: Map<string, string>;
  let noCostCookies: Map<string, string>;
  let crewCookies: Map<string, string>;
  const rows = async () =>
    harnessSql()`select tier from public.render_tier_model where tenant_id = ${tenant}::uuid order by tier`;

  beforeAll(async () => {
    tenant = await createTenant();
    const owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['settings_render_models', 'see_company_costs']);
    const noCost = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, noCost.membershipId, ['settings_render_models']);
    const crew = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, crew.membershipId, ['view_projects', 'see_company_costs']);
    ownerCookies = await cookiesFor(owner.email);
    noCostCookies = await cookiesFor(noCost.email);
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

  it('GET: 401 signed out, 403 without settings_render_models; every tier starts with no model', async () => {
    expect((await get()).res.status).toBe(401);
    state.store = new Map(crewCookies);
    const denied = await get();
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual(FORBIDDEN);

    state.store = new Map(ownerCookies);
    const r = await get();
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(r.json.costs).toBe(true);
    expect(r.json.tiers).toEqual([
      { tier: 'fast', model: null, costUsdPerRender: null },
      { tier: 'standard', model: null, costUsdPerRender: null },
      { tier: 'photoreal', model: null, costUsdPerRender: null },
    ]);
    expect(r.json.allowance).toBeNull();
    expect(r.json.models.map((m) => m.key)).toContain('gemini-3.1-flash-image-1k');
  });

  it('AC-EZD-1102-1: PATCH without a model on every tier is refused (400) and saves nothing', async () => {
    state.store = new Map(ownerCookies);
    for (const tiers of [
      ALL_TIERS.slice(0, 2),
      [...ALL_TIERS.slice(0, 2), { tier: 'photoreal', model: null }],
      [...ALL_TIERS.slice(0, 2), { tier: 'photoreal', model: '' }],
      [],
    ]) {
      const r = await patch({ tiers });
      expect(r.res.status, JSON.stringify(tiers)).toBe(400);
      expect(r.json).toEqual(REQUIRED);
    }
    expect(await rows()).toEqual([]);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('PATCH: 403 without the switch; 400 for a bad body; dollars without See company costs are 403', async () => {
    state.store = new Map(crewCookies);
    expect((await patch({ tiers: ALL_TIERS })).json).toEqual(FORBIDDEN);
    state.store = new Map(ownerCookies);
    for (const bad of [
      '{',
      {},
      { tiers: ALL_TIERS, other: 1 },
      { tiers: [{ ...ALL_TIERS[0], model: 'flux-kontext-max' }, ...ALL_TIERS.slice(1)] },
      { tiers: [{ ...ALL_TIERS[0], costUsdPerRender: -1 }, ...ALL_TIERS.slice(1)] },
      { tiers: ALL_TIERS, allowance: { amountUsd: 0, refillAmountUsd: 50 } },
    ]) {
      state.store = new Map(ownerCookies);
      const r = await patch(bad);
      expect(r.res.status, JSON.stringify(bad)).toBe(400);
    }
    state.store = new Map(noCostCookies);
    const dollars = await patch({ tiers: ALL_TIERS });
    expect(dollars.res.status).toBe(403);
    state.store = new Map(noCostCookies);
    const allowance = await patch({
      tiers: ALL_TIERS.map(({ tier, model }) => ({ tier, model })),
      allowance: { amountUsd: 50, refillAmountUsd: 50 },
    });
    expect(allowance.res.status).toBe(403);
    expect(await rows()).toEqual([]);
  });

  it('saves every tier and the allowance, emits render.model_config_updated; no dollars without See company costs', async () => {
    state.store = new Map(ownerCookies);
    const saved = await patch({ tiers: ALL_TIERS, allowance: { amountUsd: 50, refillAmountUsd: 50 } });
    expect(saved.res.status).toBe(200);
    const body = saved.json as RenderModelsSettings;
    expect(body.tiers).toEqual(ALL_TIERS);
    expect(body.allowance).toMatchObject({ amountUsd: 50, balanceUsd: 50, refillAmountUsd: 50 });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0][0]).toBe('render.model_config_updated');
    expect(emitMock.mock.calls[0][1]).toEqual({ tiers: ['fast', 'standard', 'photoreal'], allowance: true });
    expect(emitMock.mock.calls[0][2]).toMatchObject({ tenantId: tenant });

    // A member without See company costs sees the models and no dollar key at all.
    emitMock.mockClear();
    state.store = new Map(noCostCookies);
    const r = await get();
    expect(r.json.costs).toBe(false);
    expect(r.json.tiers).toEqual(ALL_TIERS.map(({ tier, model }) => ({ tier, model })));
    expect('allowance' in r.json).toBe(false);
    expect(JSON.stringify(r.json)).not.toMatch(/usd/i);

    // They change a model; the stored costs stay.
    state.store = new Map(noCostCookies);
    const changed = await patch({
      tiers: [
        { tier: 'fast', model: 'gemini-3.1-flash-image-1k' },
        { tier: 'standard', model: 'gemini-3.1-flash-image-1k' },
        { tier: 'photoreal', model: 'gemini-3.1-flash-image-4k' },
      ],
    });
    expect(changed.res.status).toBe(200);
    expect(JSON.stringify(changed.json)).not.toMatch(/usd/i);
    expect(emitMock.mock.calls[0][1]).toEqual({ tiers: ['fast'], allowance: false });
    state.store = new Map(ownerCookies);
    expect((await get()).json.tiers[0]).toEqual({
      tier: 'fast',
      model: 'gemini-3.1-flash-image-1k',
      costUsdPerRender: 0.03,
    });
  });
});
