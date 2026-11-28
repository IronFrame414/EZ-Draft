// EZD-1711 (Q-0237; vault/build/assumptions/EZD-1711.md Settled "Prices and provider"): the plan amounts the app
// shows. Stripe charges the price ids Josh sets in the environment; these constants only label them.
export const PLAN = {
  /** Dollars a month per company (Q-0237). */
  monthlyDollars: 50,
  /** Office users included in the monthly price (Q-0237). */
  includedOfficeUsers: 5,
  /** Dollars a month for each office user past the included ones (Q-0237). */
  extraOfficeUserDollars: 10,
  /** Days of free trial, no card (Q-0237). */
  trialDays: 14,
  /** Days of view and export after a company stops paying (Q-0795). */
  graceDays: 14,
} as const;

export type BillingMode = 'full' | 'grace' | 'locked';

export type BillingStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'paused'
  | 'incomplete'
  | 'incomplete_expired';

/** The signed-in company's billing state (public.billing_gate). `applies` false: exempt or never billed. */
export type BillingState =
  | { applies: false; mode: 'full' }
  | {
      applies: true;
      mode: BillingMode;
      status: BillingStatus;
      daysLeft: number | null;
      trialEndsAt: string | null;
      currentPeriodEnd: string | null;
      hasSubscription: boolean;
    };

/** What the banner says, if anything (Q-0795; Settled wording rows). */
export type BillingNotice =
  | { kind: 'grace'; daysLeft: number }
  | { kind: 'past_due' }
  | { kind: 'trial'; daysLeft: number }
  | null;

export function billingNotice(state: BillingState | null): BillingNotice {
  if (state === null || !state.applies) return null;
  if (state.mode === 'grace') return { kind: 'grace', daysLeft: state.daysLeft ?? 1 };
  if (state.mode !== 'full') return null;
  if (state.status === 'past_due' || state.status === 'incomplete') return { kind: 'past_due' };
  if (state.status === 'trialing' && state.daysLeft !== null) {
    return { kind: 'trial', daysLeft: state.daysLeft };
  }
  return null;
}
