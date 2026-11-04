'use client';
// Confirm dialog on Radix AlertDialog (vault/plans/EZD-015b.md Step 6; S20 footer).
import { AlertDialog } from 'radix-ui';
import { useT } from '../../lib/messages';
import { StateButton } from './StateButton';
import type { ConfirmChoice, ConfirmRequest } from './confirm-controller';
import styles from './ConfirmDialog.module.css';

export type ConfirmDialogProps = {
  request: ConfirmRequest;
  onChoose: (choice: ConfirmChoice) => void;
};

export function ConfirmDialog({ request, onChoose }: ConfirmDialogProps) {
  const t = useT();
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onChoose('cancel');
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay data-confirm-overlay="" className={styles.overlay} />
        <AlertDialog.Content
          data-confirm=""
          lang={t.language}
          className={styles.content}
          {...(request.message ? {} : { 'aria-describedby': undefined })}
        >
          <div className={styles.body}>
            <AlertDialog.Title className={styles.title}>
              {t(request.title, request.params)}
            </AlertDialog.Title>
            {request.message ? (
              <AlertDialog.Description className={styles.message}>
                {t(request.message, request.params)}
              </AlertDialog.Description>
            ) : null}
          </div>
          <div className={styles.footer}>
            <AlertDialog.Cancel asChild>
              <StateButton>{t(request.cancelLabel)}</StateButton>
            </AlertDialog.Cancel>
            {request.discardLabel ? (
              <StateButton
                variant="secondary"
                data-confirm-discard=""
                onClick={() => onChoose('discard')}
              >
                {t(request.discardLabel)}
              </StateButton>
            ) : null}
            <AlertDialog.Action asChild onClick={() => onChoose('confirm')}>
              <StateButton variant={request.tone}>{t(request.confirmLabel)}</StateButton>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
