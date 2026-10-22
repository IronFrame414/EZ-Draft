'use client';
// Inline error with Retry (vault/plans/EZD-015a.md Step 4; S01 Error).
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageParams } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import { StateButton } from './StateButton';
import styles from './banner.module.css';

export type InlineErrorProps = {
  message: MessageKey;
  params?: MessageParams;
  onRetry?: () => void;
};

export function InlineError({ message, params, onRetry }: InlineErrorProps) {
  const t = useT();
  return (
    <div role="alert" data-state="error" className={`${styles.banner} ${styles.error}`}>
      <span className={styles.icon}>
        <Icon name="error" size={20} />
      </span>
      <span className={styles.text}>{t(message, params)}</span>
      {onRetry ? (
        <StateButton compact onClick={() => onRetry()}>
          {t('common.retry')}
        </StateButton>
      ) : null}
    </div>
  );
}
