// EZD-1711 (AC-EZD-1711-1..3): the signed-in company's billing state from public.billing_gate (one indexed read;
// the stored status only, never a live Stripe call). Null when billing is off. getBillingState is cached per
// request so the layout and the page share one read.
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingState } from '../../lib/billing/plan';
import { createSessionClient } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { reportError } from '../errors/report';
import { billingEnabled } from './config';
import { parseBillingGate } from './state-parse';

export { parseBillingGate };

/** The company's state; rejects on a database error (callers decide). */
export async function loadBillingState(client: SupabaseClient<Database>): Promise<BillingState> {
  const { data, error } = await client.rpc('billing_gate');
  if (error) throw error;
  return parseBillingGate(data);
}

/** The Stripe customer of the signed-in company, for Checkout and the portal (billing routes only). */
export async function loadStripeCustomer(client: SupabaseClient<Database>): Promise<string | null> {
  const { data, error } = await client.rpc('billing_gate');
  if (error) throw error;
  const o = (data ?? {}) as Record<string, unknown>;
  return o.applies === true && typeof o.stripe_customer_id === 'string'
    ? o.stripe_customer_id
    : null;
}

/** Billing off, or a failed read: null (the page shows as if not billed; the request gate enforces). */
export const getBillingState = cache(async (): Promise<BillingState | null> => {
  if (!billingEnabled()) return null;
  try {
    return await loadBillingState(createSessionClient());
  } catch {
    // Code only, never the caught message (ARCH Errors and logging).
    await reportError(new Error('billing_state_load_failed'), {
      source: 'function',
      location: 'billing.state',
    });
    return null;
  }
});
