// EZD-1711 (AC-EZD-1711-2; Q-0237; 13b R2; Settled "Who manages billing", "Card data"): the Settings > Billing
// routes with stubbed session, permissions, database answer and the Stripe stub. Expected values: 404 billing off;
// 401 no session; 404 for a company that is not billed (Worth Properties, exempt) whoever asks; 403 without
// Company settings; the plan amounts of Q-0237 ($50, 5 included, $10) only with See company costs; Checkout,
// portal or a new subscription by status.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionKey } from '../../../../lib/permissions/catalog';

const h = vi.hoisted(() => ({
  session: true,
  gate: { applies: true, mode: 'full', status: 'trialing', days_left: 9 } as Record<string, unknown>,
  keys: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../../server/auth/session', () => ({
  requireApiSession: async () =>
    h.session
      ? { authUserId: 'a1', appUserId: 'u1', email: 'o@example.test' }
      : Response.json({ error: { code: 'not_signed_in' } }, { status: 401 }),
}));
vi.mock('../../../../server/auth/supabase-server', () => ({
  createSessionClient: () => ({
    rpc: async () => ({
      data: { ...h.gate, stripe_customer_id: 'cus_ezdtest' },
      error: null,
    }),
  }),
}));
vi.mock('../../../../server/permissions', () => ({
  requireApiPermission: async (p: PermissionKey) =>
    h.keys.includes(p)
      ? { session: {}, ctx: { permissions: new Set(h.keys) } }
      : Response.json({ error: { code: 'permission_denied' } }, { status: 403 }),
}));
vi.mock('../../../../server/errors/route-failure', () => ({ reportRouteFailure: vi.fn() }));

import { GET } from './route';
import { POST as checkout } from './checkout/route';
import { POST as portal } from './portal/route';

const post = (fn: (r: Request) => Promise<Response>, path: string) =>
  fn(new Request(`http://localhost:3000${path}`, { method: 'POST' }));

describe('EZD-1711 Settings > Billing routes', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_MODE', 'stub');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    h.session = true;
    h.gate = { applies: true, mode: 'full', status: 'trialing', days_left: 9 };
    h.keys = ['settings_company', 'see_company_costs'];
  });
  afterEach(() => vi.unstubAllEnvs());

  const all = () => [
    GET(),
    post(checkout, '/api/settings/billing/checkout'),
    post(portal, '/api/settings/billing/portal'),
  ];

  it('R1 billing off: every billing route is 404', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    for (const res of await Promise.all(all())) expect(res.status).toBe(404);
  });

  it('R2 no session: 401', async () => {
    h.session = false;
    for (const res of await Promise.all(all())) expect(res.status).toBe(401);
  });

  it('R3 AC-EZD-1711-2: a company that is not billed (Worth Properties) gets 404 from every route, with or without switches', async () => {
    h.gate = { applies: false, mode: 'full' };
    for (const keys of [['settings_company', 'see_company_costs'], []]) {
      h.keys = keys;
      for (const res of await Promise.all(all())) {
        expect(res.status).toBe(404);
        expect((await res.json()).error.code).toBe('billing_not_found');
      }
    }
  });

  it('R4 without Company settings: 403', async () => {
    h.keys = ['see_company_costs'];
    for (const res of await Promise.all(all())) expect(res.status).toBe(403);
  });

  it('R5 GET: the state, and the Q-0237 plan amounts only with See company costs', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      billing: {
        mode: 'full',
        status: 'trialing',
        daysLeft: 9,
        trialEndsAt: null,
        currentPeriodEnd: null,
        hasSubscription: false,
        plan: { monthlyDollars: 50, includedOfficeUsers: 5, extraOfficeUserDollars: 10 },
      },
    });
    h.keys = ['settings_company'];
    expect((await (await GET()).json()).billing.plan).toBeNull();
  });

  it('R6 checkout: a card in the trial, a new subscription after cancel, the portal for an unpaid invoice', async () => {
    const urlFor = async () =>
      (await (await post(checkout, '/api/settings/billing/checkout')).json()).url as string;
    expect(await urlFor()).toBe('http://localhost:3000/settings/billing?stripe_stub=checkout');
    h.gate = { applies: true, mode: 'grace', status: 'canceled' };
    expect(await urlFor()).toBe('http://localhost:3000/settings/billing?stripe_stub=checkout');
    h.gate = { applies: true, mode: 'locked', status: 'unpaid' };
    expect(await urlFor()).toBe('http://localhost:3000/settings/billing?stripe_stub=portal');
    const p = await post(portal, '/api/settings/billing/portal');
    expect(await p.json()).toEqual({ url: 'http://localhost:3000/settings/billing?stripe_stub=portal' });
  });
});

describe('EZD-1711 billing return address', () => {
  it('R7 the browser origin wins over the request URL host', async () => {
    const { billingReturnUrl } = await import('../../../../server/billing/routes');
    const r = new Request('http://localhost:3010/api/settings/billing/checkout', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3010' },
    });
    expect(billingReturnUrl(r)).toBe('http://127.0.0.1:3010/settings/billing');
    expect(billingReturnUrl(new Request('http://localhost:3010/x'))).toBe(
      'http://localhost:3010/settings/billing',
    );
    const bad = new Request('http://localhost:3010/x', { headers: { origin: 'null' } });
    expect(billingReturnUrl(bad)).toBe('http://localhost:3010/settings/billing');
  });
});
