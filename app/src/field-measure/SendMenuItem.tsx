'use client';
// EZD-2025 (audit 2026-11-27 A4; AC-EZD-2025-2): Send to office in the field measure menu (S17b Send to office "Menu").
// It is greyed until the page's field sender has started; then the reason shows beside it: still starting, or it
// could not start on this phone (it is tried again when the network comes back). Wording for Josh:
// vault/build/assumptions/EZD-2025.md.
import type { ReactElement } from 'react';
import type { FieldSenderState } from '../components/outbox/OutboxDrain';
import { useT } from '../lib/messages';
import styles from './FieldMeasure.module.css';
import notes from './NotSaved.module.css';

export function SendMenuItem({
  canEdit,
  senderState,
  onSend,
}: {
  canEdit: boolean;
  senderState: FieldSenderState;
  onSend(): void;
}): ReactElement {
  const t = useT();
  const reason =
    !canEdit || senderState === 'ready'
      ? null
      : senderState === 'starting'
        ? t('field.measure.send_starting')
        : t('field.measure.send_unavailable');
  return (
    <>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        disabled={!canEdit || senderState !== 'ready'}
        aria-describedby={reason !== null ? 'send-reason' : undefined}
        onClick={onSend}
      >
        {t('field.measure.send')}
      </button>
      {reason !== null ? (
        <span id="send-reason" className={notes.reason} data-testid="send-reason">
          {reason}
        </span>
      ) : null}
    </>
  );
}
