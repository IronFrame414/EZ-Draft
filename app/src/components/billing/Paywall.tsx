// EZD-1711 (AC-EZD-1711-1, -3; Q-0795; wording rows): after the 14 days of view and export, the only page a
// company's members see. "Pay now" for members with Company settings; the others are told to ask their owner. Text
// arrives resolved from the server.
import type { ReactNode } from 'react';
import { Icon } from '../icon/Icon';
import { BillingButton } from './BillingButton';
import styles from './billing.module.css';

export type PaywallProps = {
  title: string;
  body: string;
  payNow: { label: string; errorText: string } | null;
  askOwner: string;
  signOut?: ReactNode;
};

export function Paywall({ title, body, payNow, askOwner, signOut }: PaywallProps) {
  return (
    <main className={styles.paywall} data-billing="paywall">
      <div className={styles.card}>
        <span className={styles.lock}>
          <Icon name="lock" size={32} />
        </span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
        {payNow ? (
          <BillingButton
            endpoint="/api/settings/billing/checkout"
            label={payNow.label}
            errorText={payNow.errorText}
            primary
          />
        ) : (
          <p className={styles.body}>{askOwner}</p>
        )}
        {signOut ? <div className={styles.signOut}>{signOut}</div> : null}
      </div>
    </main>
  );
}
