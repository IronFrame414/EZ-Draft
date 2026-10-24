'use client';
// Toast list (vault/plans/EZD-015b.md Step 5; S06 toast).
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import { StateButton } from './StateButton';
import type { Toast } from './toast-store';
import styles from './Toast.module.css';

export type ToastListProps = {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
  onAction: (id: string) => void;
};

export function ToastList({ toasts, onDismiss, onAction }: ToastListProps) {
  const t = useT();
  return (
    <div data-toast-viewport="" role="status" aria-live="polite" className={styles.viewport}>
      {toasts.map((toast) => (
        <div key={toast.id} data-toast="" className={styles.toast}>
          <span className={styles.text}>{t(toast.message, toast.params)}</span>
          {toast.action ? (
            <StateButton compact onClick={() => onAction(toast.id)}>
              {t(toast.action.label)}
            </StateButton>
          ) : null}
          <StateButton
            variant="icon"
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={() => onDismiss(toast.id)}
          >
            <Icon name="close" size={18} />
          </StateButton>
        </div>
      ))}
    </div>
  );
}
