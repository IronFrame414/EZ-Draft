// EZD-1711: the shape of public.billing_gate's answer, shared by the request gate (proxy.ts) and the pages. An
// unknown mode reads as full and an unknown status as active, so a bad answer never locks a company out.
import type { BillingMode, BillingState, BillingStatus } from '../../lib/billing/plan';

const MODES: readonly BillingMode[] = ['full', 'grace', 'locked'];
const BILLING_STATUSES: readonly BillingStatus[] = [
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'paused',
  'incomplete',
  'incomplete_expired',
];

export function parseBillingGate(raw: unknown): BillingState {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (o.applies !== true) return { applies: false, mode: 'full' };
  const mode = MODES.includes(o.mode as BillingMode) ? (o.mode as BillingMode) : 'full';
  const status = BILLING_STATUSES.includes(o.status as BillingStatus)
    ? (o.status as BillingStatus)
    : 'active';
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    applies: true,
    mode,
    status,
    daysLeft: typeof o.days_left === 'number' ? o.days_left : null,
    trialEndsAt: str(o.trial_ends_at),
    currentPeriodEnd: str(o.current_period_end),
    hasSubscription: o.has_subscription === true,
  };
}

