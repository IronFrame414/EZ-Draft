// EZD-1711 (vault/build/assumptions/EZD-1711.md Settled "Before Josh sets up Stripe", "Outside services and stubs"):
// billing is on only when the environment names a Stripe webhook secret and either a Stripe secret key (live) or
// STRIPE_MODE=stub (tests). With billing off there is no Billing section, no paywall and no billing route.
// Values are read per call and never logged.
export type BillingEnv = Readonly<Record<string, string | undefined>>;

export type BillingConfig = {
  mode: 'live' | 'stub';
  secretKey: string | null;
  webhookSecret: string;
  basePriceId: string | null;
  seatPriceId: string | null;
};

const nonEmpty = (v: string | undefined): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

export function billingConfig(env: BillingEnv = process.env): BillingConfig | null {
  const webhookSecret = nonEmpty(env.STRIPE_WEBHOOK_SECRET);
  if (webhookSecret === null) return null;
  const secretKey = nonEmpty(env.STRIPE_SECRET_KEY);
  const stub = env.STRIPE_MODE === 'stub';
  if (!stub && secretKey === null) return null;
  return {
    mode: stub ? 'stub' : 'live',
    secretKey,
    webhookSecret,
    basePriceId: nonEmpty(env.STRIPE_PRICE_BASE),
    seatPriceId: nonEmpty(env.STRIPE_PRICE_SEAT),
  };
}

export function billingEnabled(env: BillingEnv = process.env): boolean {
  return billingConfig(env) !== null;
}
