// EZD-1711 (Q-0236; vault/build/assumptions/EZD-1711.md Settled "Card data", "Outside services and stubs"): the
// only Stripe calls EZ Draft makes. Card data never reaches EZ Draft: Stripe-hosted Checkout adds a card and starts
// paying; the Stripe customer portal changes the card, cancels and shows invoices. STRIPE_MODE=stub (tests) answers
// without any network call; live mode uses the official `stripe` package with STRIPE_SECRET_KEY. Server only.
import 'server-only';
import Stripe from 'stripe';
import type { BillingConfig } from './config';

export type StripeBilling = {
  /**
   * A Checkout session; answers its hosted URL. setup: adds a card for the existing subscription (the trial
   * started with no card, Q-0237). subscribe: a new subscription to the base price after the old one ended.
   */
  checkoutUrl(input: {
    customer: string;
    returnUrl: string;
    kind: 'setup' | 'subscribe';
  }): Promise<string>;
  /** A customer portal session; answers its hosted URL. */
  portalUrl(input: { customer: string; returnUrl: string }): Promise<string>;
  /** After Checkout (setup) completes: the new card becomes the customer's card for invoices. */
  useSetupCard(input: { customer: string; setupIntent: string }): Promise<void>;
};

export const STUB_CHECKOUT_MARK = 'stripe_stub=checkout';
export const STUB_PORTAL_MARK = 'stripe_stub=portal';

function withMark(url: string, mark: string): string {
  return url.includes('?') ? `${url}&${mark}` : `${url}?${mark}`;
}

export function stubStripeBilling(): StripeBilling {
  return {
    checkoutUrl: async ({ returnUrl }) => withMark(returnUrl, STUB_CHECKOUT_MARK),
    portalUrl: async ({ returnUrl }) => withMark(returnUrl, STUB_PORTAL_MARK),
    useSetupCard: async () => {},
  };
}

function liveStripeBilling(config: BillingConfig): StripeBilling {
  if (config.secretKey === null) throw new Error('stripe_secret_key_not_set');
  const stripe = new Stripe(config.secretKey);
  return {
    async checkoutUrl({ customer, returnUrl, kind }) {
      if (kind === 'subscribe' && config.basePriceId === null) throw new Error('stripe_price_not_set');
      const session = await stripe.checkout.sessions.create(
        kind === 'setup'
          ? { mode: 'setup', customer, currency: 'usd', success_url: returnUrl, cancel_url: returnUrl }
          : {
              mode: 'subscription',
              customer,
              line_items: [{ price: config.basePriceId as string, quantity: 1 }],
              automatic_tax: { enabled: true },
              customer_update: { address: 'auto' },
              success_url: returnUrl,
              cancel_url: returnUrl,
            },
      );
      if (!session.url) throw new Error('stripe_checkout_no_url');
      return session.url;
    },
    async portalUrl({ customer, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
      return session.url;
    },
    async useSetupCard({ customer, setupIntent }) {
      const intent = await stripe.setupIntents.retrieve(setupIntent);
      const pm = typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id;
      if (!pm) return;
      await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm } });
      // A trial that ended with no card pauses the subscription; the new card resumes it.
      const paused = await stripe.subscriptions.list({ customer, status: 'paused', limit: 10 });
      for (const sub of paused.data) await stripe.subscriptions.resume(sub.id);
    },
  };
}

export function stripeBilling(config: BillingConfig): StripeBilling {
  return config.mode === 'stub' ? stubStripeBilling() : liveStripeBilling(config);
}
