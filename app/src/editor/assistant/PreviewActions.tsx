'use client';
// EZD-5604b (vault/plans/EZD-5604b.md): the preview's Accept, Adjust and Reject row under the reply (section 3 V1;
// Decided "D-Actions"; board S03c line 156; AC-EZD-5604-7; AC-EZD-5603-10 via Q-0651 (a)). Accept and Adjust are
// disabled until EZD-5605 passes their handlers; Reject is always enabled.
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import styles from './PreviewActions.module.css';

export type PreviewActionsProps = {
  onReject(): void;
  onAccept?: () => void;
  onAdjust?: () => void;
};

export function PreviewActions({ onReject, onAccept, onAdjust }: PreviewActionsProps) {
  const t = useT();
  return (
    <div className={styles.row} data-testid="assistant-preview-actions">
      <button
        type="button"
        className={`${styles.button} ${styles.primary} ${touch.target}`}
        data-testid="assistant-accept"
        disabled={onAccept === undefined}
        onClick={onAccept}
      >
        {t('office.assistant.accept')}
      </button>
      <button
        type="button"
        className={`${styles.button} ${touch.target}`}
        data-testid="assistant-adjust"
        disabled={onAdjust === undefined}
        onClick={onAdjust}
      >
        {t('office.assistant.adjust')}
      </button>
      <button
        type="button"
        className={`${styles.button} ${touch.target}`}
        data-testid="assistant-reject"
        onClick={onReject}
      >
        {t('office.assistant.reject')}
      </button>
    </div>
  );
}
