'use client';
// EZD-1711 (Q-0237, Q-0795, Q-0790: built from the written spec in the style of the Settings boards; wording rows in
// vault/build/assumptions/EZD-1711.md): Settings > Billing. The status line (trial days left, failed payment, days of
// view and export left, or active), the plan line with its dollar amounts only for See company costs (13b R2), and
// the Stripe-hosted actions: "Add a card" in the trial, "Pay now" after the subscription ended, "Manage billing".
import { BillingButton } from '../../billing/BillingButton';
import { useT } from '../../../lib/messages';
import type { BillingState } from '../../../lib/billing/plan';
import { PLAN } from '../../../lib/billing/plan';
import styles from './BillingPanel.module.css';

export type BillingPanelProps = {
  state: Extract<BillingState, { applies: true }>;
  showPlan: boolean;
};

export function BillingPanel({ state, showPlan }: BillingPanelProps) {
  const t = useT();
  const days = state.daysLeft ?? 1;
  const status =
    state.mode === 'grace'
      ? t('office.billing.grace', { count: days })
      : state.status === 'past_due' || state.status === 'incomplete'
        ? t('office.billing.past_due')
        : state.status === 'trialing'
          ? t('office.billing.trial', { count: state.daysLeft ?? 0 })
          : t('office.billing.active');
  const errorText = t('error.billing_unavailable');
  return (
    <div className={styles.panel} data-billing-status={state.status} data-billing-mode={state.mode}>
      <p className={styles.status}>{status}</p>
      {showPlan ? (
        <p className={styles.plan} data-billing-plan="">
          {t('office.billing.plan', {
            monthly: PLAN.monthlyDollars,
            included: PLAN.includedOfficeUsers,
            extra: PLAN.extraOfficeUserDollars,
          })}
        </p>
      ) : null}
      <div className={styles.actions}>
        {state.mode === 'grace' ? (
          <BillingButton
            endpoint="/api/settings/billing/checkout"
            label={t('office.billing.pay_now')}
            errorText={errorText}
            primary
          />
        ) : state.status === 'trialing' ? (
          <BillingButton
            endpoint="/api/settings/billing/checkout"
            label={t('office.billing.add_card')}
            errorText={errorText}
            primary
          />
        ) : null}
        <BillingButton
          endpoint="/api/settings/billing/portal"
          label={t('office.billing.manage')}
          errorText={errorText}
        />
      </div>
    </div>
  );
}
