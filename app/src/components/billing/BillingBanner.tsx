// EZD-1711 (Q-0795; Q-0790 "the trial banner"; vault/build/assumptions/EZD-1711.md wording rows): the billing line
// at the top of every office and editor page: the days of view and export left, a failed payment, or the trial's
// days left. Text arrives resolved, so it renders on the server with no messages sent.
import { Icon } from '../icon/Icon';
import styles from '../states/banner.module.css';
import own from './billing.module.css';

export type BillingBannerProps = { kind: 'grace' | 'past_due' | 'trial'; text: string };

export function BillingBanner({ kind, text }: BillingBannerProps) {
  const tone = kind === 'trial' ? styles.offline : styles.error;
  return (
    <div
      role="status"
      data-billing={kind}
      className={`${styles.banner} ${tone} ${own.pageBanner}`}
    >
      <span className={styles.icon}>
        <Icon name={kind === 'trial' ? 'info' : 'error'} size={20} />
      </span>
      <span className={styles.text}>{text}</span>
    </div>
  );
}
