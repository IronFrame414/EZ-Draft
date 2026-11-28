// EZD-1711 (AC-EZD-1711-1, -3; Settled "Webhook", "Outside services and stubs"): the Stripe webhook route with signed
// fixture bodies and a fake database client; no network. Expected values: the route's order (404 billing off; 400
// invalid_signature; 200 { received: true } after billing_apply_subscription; 500 db_unavailable) and the
// billing_apply_subscription arguments from the event's subscription object.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rpc: vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
    data: 'applied' as unknown,
    error: null as unknown,
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../../server/jobs/db', () => ({ createJobsDbClient: () => ({ rpc: h.rpc }) }));
vi.mock('../../../../server/errors/route-failure', () => ({ reportRouteFailure: vi.fn(async () => {}) }));

import {
  TEST_WEBHOOK_SECRET,
  newCustomerId,
  signed,
  subscriptionEvent,
} from '../../../../server/billing/fixtures/stripe-events';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { POST } from './route';

const post = (body: string, signature: string | null) =>
  POST(
    new Request('http://localhost/api/billing/stripe-webhook', {
      method: 'POST',
      body,
      headers: signature === null ? {} : { 'stripe-signature': signature },
    }),
  );

describe('EZD-1711 Stripe webhook route', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_MODE', 'stub');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', TEST_WEBHOOK_SECRET);
    h.rpc.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('W1 billing off: 404 and nothing applied', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const body = subscriptionEvent({ customer: newCustomerId(), status: 'unpaid' });
    const res = await post(body, signed(body));
    expect(res.status).toBe(404);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('W2 missing, wrong-secret or tampered signature: 400 invalid_signature, nothing applied', async () => {
    const body = subscriptionEvent({ customer: newCustomerId(), status: 'unpaid' });
    for (const [b, sig] of [
      [body, null],
      [body, signed(body, 'whsec_other')],
      [body.replace('unpaid', 'active'), signed(body)],
    ] as const) {
      const res = await post(b, sig);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_signature');
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('W3 a signed unpaid subscription event is applied from its own object', async () => {
    const customer = newCustomerId();
    const created = 1_795_000_000;
    const body = subscriptionEvent({
      customer,
      subscription: 'sub_ezdabc',
      id: 'evt_ezdabc',
      status: 'unpaid',
      created,
      periodEnd: created + 86400,
    });
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('billing_apply_subscription', {
      p_event_id: 'evt_ezdabc',
      p_event_type: 'customer.subscription.updated',
      p_event_created: new Date(created * 1000).toISOString(),
      p_customer: customer,
      p_subscription: 'sub_ezdabc',
      p_status: 'unpaid',
      p_trial_ends_at: null,
      p_period_end: new Date((created + 86400) * 1000).toISOString(),
      p_seats: null,
    });
  });

  it('W4 a deleted subscription is applied as canceled', async () => {
    const body = subscriptionEvent({
      customer: newCustomerId(),
      status: 'active',
      type: 'customer.subscription.deleted',
    });
    expect((await post(body, signed(body))).status).toBe(200);
    expect(h.rpc.mock.calls[0][1].p_status).toBe('canceled');
  });

  it('W5 an event type it does not use is acknowledged and not applied', async () => {
    const body = subscriptionEvent({
      customer: newCustomerId(),
      status: 'active',
      type: 'invoice.created',
    });
    const res = await post(body, signed(body));
    expect(res.status).toBe(200);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('W6 duplicate and unknown-customer answers are still 200, so Stripe stops retrying', async () => {
    for (const answer of ['duplicate', 'stale', 'unknown_customer', 'exempt']) {
      h.rpc.mockResolvedValueOnce({ data: answer, error: null });
      const body = subscriptionEvent({ customer: newCustomerId(), status: 'active' });
      expect((await post(body, signed(body))).status, answer).toBe(200);
    }
  });

  it('W7 a database failure is 500 db_unavailable and reported, so Stripe retries', async () => {
    h.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
    const body = subscriptionEvent({ customer: newCustomerId(), status: 'unpaid' });
    const res = await post(body, signed(body));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('db_unavailable');
    expect(reportRouteFailure).toHaveBeenCalledTimes(1);
  });
});
