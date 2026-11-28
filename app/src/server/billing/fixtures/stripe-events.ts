// EZD-1711 (Settled "Outside services and stubs"): signed fixture Stripe webhook bodies for tests, made with a test
// secret and Stripe's own test-header helper. Shapes follow the `stripe` package types (Stripe.Event,
// Stripe.Subscription); only the fields the webhook reads are filled.
import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';

export const TEST_WEBHOOK_SECRET = 'whsec_ezd1711_test_secret';

const rand = () => randomBytes(9).toString('hex');

export const newCustomerId = () => `cus_ezd${rand()}`;
export const newSubscriptionId = () => `sub_ezd${rand()}`;
export const newEventId = () => `evt_ezd${rand()}`;

export type SubscriptionEventInput = {
  customer: string;
  subscription?: string;
  status: string;
  type?: string;
  id?: string;
  /** Unix seconds; defaults to now. */
  created?: number;
  trialEnd?: number | null;
  periodEnd?: number;
};

export function subscriptionEvent(i: SubscriptionEventInput): string {
  const created = i.created ?? Math.floor(Date.now() / 1000);
  return JSON.stringify({
    id: i.id ?? newEventId(),
    object: 'event',
    type: i.type ?? 'customer.subscription.updated',
    created,
    livemode: false,
    api_version: '2026-01-01',
    data: {
      object: {
        id: i.subscription ?? newSubscriptionId(),
        object: 'subscription',
        customer: i.customer,
        status: i.status,
        trial_end: i.trialEnd ?? null,
        items: {
          object: 'list',
          data: [
            {
              id: `si_${rand()}`,
              object: 'subscription_item',
              quantity: 1,
              current_period_end: i.periodEnd ?? created + 30 * 86400,
            },
          ],
        },
      },
    },
  });
}

export function signed(body: string, secret = TEST_WEBHOOK_SECRET): string {
  return Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
}
