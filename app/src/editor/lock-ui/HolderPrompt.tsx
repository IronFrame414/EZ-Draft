'use client';
// EZD-126 (S06:76 lock holder prompt; Q-0697 decisions 05: a modal with a minutes:seconds countdown, Release and
// Keep editing): shown to the holder while a request is open. It closes only when the lock state drops the
// request (answered, cancelled or timed out); Esc does nothing. Keep editing has the focus first, as the confirm
// dialog's Cancel. Look from ConfirmDialog.module.css.
import type { ReactElement } from 'react';
import { AlertDialog } from 'radix-ui';
import dialog from '../../components/states/ConfirmDialog.module.css';
import { StateButton } from '../../components/states/StateButton';
import { useT } from '../../lib/messages';
import type { LockUiState } from './lock-ui-store';
import styles from './LockUi.module.css';

export function HolderPrompt(p: {
  prompt: NonNullable<LockUiState['prompt']>;
  onRelease: () => void;
  onKeep: () => void;
}): ReactElement {
  const t = useT();
  const { prompt } = p;
  return (
    <AlertDialog.Root open>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialog.overlay} />
        <AlertDialog.Content
          data-testid="holder-prompt"
          lang={t.language}
          className={dialog.content}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className={dialog.body}>
            <AlertDialog.Title className={dialog.title}>
              {t('office.lock.prompt_title', {
                name: prompt.requesterName ?? t('office.lock.someone'),
              })}
            </AlertDialog.Title>
            <p data-testid="holder-prompt-countdown" className={styles.countdown}>
              {prompt.countdown}
            </p>
            <AlertDialog.Description className={dialog.message}>
              {t('office.lock.prompt_message')}
            </AlertDialog.Description>
          </div>
          <div className={dialog.footer}>
            <AlertDialog.Cancel asChild>
              <StateButton data-testid="holder-prompt-keep" disabled={prompt.busy} onClick={p.onKeep}>
                {t('office.lock.keep_editing')}
              </StateButton>
            </AlertDialog.Cancel>
            <StateButton
              variant="primary"
              data-testid="holder-prompt-release"
              disabled={prompt.busy}
              onClick={p.onRelease}
            >
              {t('office.lock.release')}
            </StateButton>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
