'use client';
// EZD-2025 (Q-0903 "Not saved to the office. Retry", decided wording; audit 2026-11-27 A3, A5; AC-EZD-2025-1, -3):
// the line a field screen shows when the office refused a save or a task check, with Retry. Field measure shows it
// under the title; the field pack on the task row.
import type { ReactElement } from 'react';
import { Icon } from '../components/icon/Icon';
import { useT } from '../lib/messages';
import styles from './NotSaved.module.css';

export function NotSavedLine({
  onRetry,
  busy = false,
  testId = 'not-saved',
}: {
  onRetry(): void;
  busy?: boolean;
  testId?: string;
}): ReactElement {
  const t = useT();
  return (
    <p className={styles.line} role="alert" data-testid={testId}>
      <Icon name="error" size={15} />
      <span>{t('field.sync.not_saved')}</span>
      <button type="button" className={styles.retry} disabled={busy} onClick={onRetry}>
        {t('common.retry')}
      </button>
    </p>
  );
}
