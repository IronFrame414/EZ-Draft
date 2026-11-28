// EZD-1711 (vault/build/assumptions/EZD-1711.md Settled "Webhook"; 07 delivery rules "idempotency key per event";
// 11 Security): a Stripe webhook body. The signature is checked over the raw body with the webhook secret
// (Stripe.webhooks.constructEvent, 5-minute tolerance); a bad or missing signature is null. Subscription events
// (customer.subscription.created, .updated, .deleted, .paused, .resumed, .trial_will_end) are applied from the
// event's own subscription object through billing_apply_subscription, never by asking Stripe. A completed setup
// Checkout makes the new card the customer's invoice card. Other event types are acknowledged and ignored.
import 'server-only';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types';
import type { StripeBilling } from './stripe';

export type SubscriptionUpdate = {
  eventId: string;
  eventType: string;
  eventCreated: string;
  customer: string;
  subscription: string;
  status: string;
  trialEndsAt: string | null;
  periodEnd: string | null;
  seats: number | null;
};

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
]);

export function verifyStripeEvent(
  body: string,
  signature: string | null,
  secret: string,
): Stripe.Event | null {
  if (signature === null || signature === '') return null;
  try {
    return Stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return null;
  }
}

const iso = (unix: number | null | undefined): string | null =>
  typeof unix === 'number' ? new Date(unix * 1000).toISOString() : null;

const idOf = (v: string | { id: string } | null | undefined): string | null =>
  typeof v === 'string' ? v : (v?.id ?? null);

export function subscriptionUpdate(event: Stripe.Event): SubscriptionUpdate | null {
  if (!SUBSCRIPTION_EVENTS.has(event.type)) return null;
  const sub = event.data.object as Stripe.Subscription;
  const customer = idOf(sub.customer);
  if (customer === null) return null;
  const items = sub.items?.data ?? [];
  const ends = items.map((i) => i.current_period_end).filter((n) => typeof n === 'number');
  return {
    eventId: event.id,
    eventType: event.type,
    eventCreated: iso(event.created) as string,
    customer,
    subscription: sub.id,
    // A deleted subscription has status canceled; say so even if the object lags.
    status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
    trialEndsAt: iso(sub.trial_end),
    periodEnd: ends.length > 0 ? iso(Math.max(...ends)) : null,
    // The seats meter (EZD-1712) sets the billed office seats; a subscription event leaves them.
    seats: null,
  };
}

export type ApplyResult =
  | 'applied'
  | 'duplicate'
  | 'stale'
  | 'unknown_customer'
  | 'exempt'
  | 'ignored';

type ApplyArgs = Database['public']['Functions']['billing_apply_subscription']['Args'];

export async function applyStripeEvent(
  db: SupabaseClient<Database>,
  event: Stripe.Event,
  stripe: StripeBilling,
): Promise<ApplyResult> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const customer = idOf(session.customer);
    const setupIntent = idOf(session.setup_intent);
    if (session.mode === 'setup' && customer !== null && setupIntent !== null) {
      await stripe.useSetupCard({ customer, setupIntent });
    }
    return 'ignored';
  }
  const u = subscriptionUpdate(event);
  if (u === null) return 'ignored';
  // The generated Args type marks every argument non-null; the function takes null trial, period and seats.
  const args = {
    p_event_id: u.eventId,
    p_event_type: u.eventType,
    p_event_created: u.eventCreated,
    p_customer: u.customer,
    p_subscription: u.subscription,
    p_status: u.status,
    p_trial_ends_at: u.trialEndsAt,
    p_period_end: u.periodEnd,
    p_seats: u.seats,
  } as unknown as ApplyArgs;
  const { data, error } = await db.rpc('billing_apply_subscription', args);
  if (error) throw error;
  return data as ApplyResult;
}
