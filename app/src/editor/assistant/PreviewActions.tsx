'use client';
// EZD-5604b (vault/plans/EZD-5604b.md): the preview's Accept, Adjust and Reject row under the reply (section 3 V1;
// Decided "D-Actions"; board S03c line 156; AC-EZD-5604-7; AC-EZD-5603-10 via Q-0651 (a)). Accept and Adjust are
// disabled until EZD-5605 passes their handlers; Reject is always enabled.
// EZD-5605 (vault/plans/EZD-5605.md D-Buttons, D-Hint; Q-0639; AC-EZD-5605-1, -3): while Accept waits all three are
// disabled; while adjusting, Adjust is pressed and disabled. The hint line after the buttons (board S03c line 157).
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import styles from './PreviewActions.module.css';

export type PreviewActionsProps = {
  onReject(): void;
  onAccept?: () => void;
  onAdjust?: () => void;
  adjusting?: boolean;
  busy?: boolean;
};

export function PreviewActions({
  onReject,
  onAccept,
  onAdjust,
  adjusting = false,
  busy = false,
}: PreviewActionsProps) {
  const t = useT();
  return (
    <div className={styles.row} data-testid="assistant-preview-actions">
      <button
        type="button"
        className={`${styles.button} ${styles.primary} ${touch.target}`}
        data-testid="assistant-accept"
        disabled={onAccept === undefined || busy}
        onClick={onAccept}
      >
        {t('office.assistant.accept')}
      </button>
      <button
        type="button"
        className={`${styles.button} ${touch.target}`}
        data-testid="assistant-adjust"
        aria-pressed={adjusting}
        disabled={onAdjust === undefined || busy || adjusting}
        onClick={onAdjust}
      >
        {t('office.assistant.adjust')}
      </button>
      <button
        type="button"
        className={`${styles.button} ${touch.target}`}
        data-testid="assistant-reject"
        disabled={busy}
        onClick={onReject}
      >
        {t('office.assistant.reject')}
      </button>
    </div>
  );
}

// D-Hint: both approved sentences in one line after the buttons.
export function PreviewHint() {
  const t = useT();
  return (
    <span className={styles.hint} data-testid="assistant-preview-hint">
      {`${t('office.assistant.adjust_hint')} ${t('office.assistant.undo_hint')}`}
    </span>
  );
}
