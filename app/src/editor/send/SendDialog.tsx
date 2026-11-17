'use client';
// EZD-111 (vault/plans/EZD-111.md P111 C1; Decided D-Dialog states, D-Buttons, D-Copy, D-Send errors, D-Sent lines,
// D-Settings link, D-Drain; Q-0700; Q-0701; 04:26 Copy link beside Send; 03b rule 8): the Send dialog. The To line
// is the project's client as the server reads it (read-only); the optional note is the only input. Before the
// send the outbox is drained, so the server checkpoint holds the latest edits. After the send, Copy link copies
// the link of the email, also when the email did not go. One send per opening. The shell copies CustomerDialog.
import { Dialog } from 'radix-ui';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { InlineError } from '../../components/states/InlineError';
import { Skeleton } from '../../components/states/Skeleton';
import { StateButton } from '../../components/states/StateButton';
import { useToast } from '../../components/states/ToastProvider';
import offline from '../../components/settings/company/offline-input.module.css';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import type { OutboxSync } from '../../lib/outbox/outbox-sync';
import {
  fetchSendRecipient,
  postClientSend,
  SEND_NOTE_MAX,
  type ClientSend,
  type SendRecipient,
} from '../../lib/sends/sends';
import type { MessageKey } from '../../server/messages/catalog';
import { formatClock } from '../save-state';
import styles from './SendDialog.module.css';

export type SendDialogProps = {
  projectId: string;
  sync: OutboxSync | null;
  onClose: () => void;
  onOpenProjectSettings: () => void;
  fetchImpl?: typeof fetch;
};

type State =
  | { kind: 'loading' }
  | { kind: 'load-failed' }
  | { kind: 'no-client' }
  | { kind: 'ready'; recipient: SendRecipient }
  | { kind: 'sending'; recipient: SendRecipient }
  | { kind: 'sent'; recipient: SendRecipient; send: ClientSend }
  | { kind: 'send-failed'; recipient: SendRecipient; error: MessageKey }
  | { kind: 'unsaved'; recipient: SendRecipient };

function sendError(status: number, code: string): MessageKey {
  if (status === 400 && code === 'invalid_input') return 'error.invalid_input';
  if (status === 403) return 'error.not_authorized';
  if (status === 404) return 'error.project_not_found';
  return 'office.send.failed';
}

export function SendDialog({
  projectId,
  sync,
  onClose,
  onOpenProjectSettings,
  fetchImpl,
}: SendDialogProps): ReactElement {
  const t = useT();
  const online = useOnline();
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [note, setNote] = useState('');

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void fetchSendRecipient(projectId, fetchImpl ? { fetchImpl } : undefined).then((r) => {
      if (!live) return;
      if (!r.ok) setState({ kind: 'load-failed' });
      else if (r.recipient === null) setState({ kind: 'no-client' });
      else setState({ kind: 'ready', recipient: r.recipient });
    });
    return () => {
      live = false;
    };
  }, [projectId, fetchImpl, attempt]);
  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  const recipient = 'recipient' in state ? state.recipient : null;

  // One send at a time: a second click before the disabled Send renders does nothing.
  const busy = useRef(false);
  const onSend = async () => {
    if (recipient === null || busy.current) return;
    busy.current = true;
    try {
      await sendNow(recipient);
    } finally {
      busy.current = false;
    }
  };
  const sendNow = async (recipient: SendRecipient) => {
    setState({ kind: 'sending', recipient });
    if (sync !== null) {
      await sync.flush();
      const status = sync.getState().status;
      if (status !== 'idle' && status !== 'saved') {
        setState({ kind: 'unsaved', recipient });
        return;
      }
    }
    const r = await postClientSend(projectId, note, fetchImpl ? { fetchImpl } : undefined);
    if (r.ok) setState({ kind: 'sent', recipient, send: r.send });
    else if (r.status === 400 && r.code === 'no_client') setState({ kind: 'no-client' });
    else setState({ kind: 'send-failed', recipient, error: sendError(r.status, r.code) });
  };

  const onCopy = (link: string) => {
    const clip = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clip) {
      toast.show({ message: 'office.send.copy_failed' });
      return;
    }
    clip.writeText(link).then(
      () => toast.show({ message: 'office.send.copied' }),
      () => toast.show({ message: 'office.send.copy_failed' }),
    );
  };

  const k = state.kind;
  const showNote = recipient !== null;
  const noteReadOnly = k === 'sending' || k === 'sent' || !online;
  const sendable = (k === 'ready' || k === 'send-failed' || k === 'unsaved') && online;
  const sent = k === 'sent' ? state.send : null;

  let toValue: ReactElement;
  if (k === 'loading') toValue = <Skeleton width="180px" height="14px" />;
  else if (recipient !== null)
    toValue = (
      <span data-testid="send-to" className={styles.toValue}>
        {`${recipient.name} · ${recipient.email}`}
      </span>
    );
  else toValue = <span className={styles.toValue} />;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          data-testid="send-dialog"
          data-send-state={k}
          lang={t.language}
          className={styles.content}
          aria-describedby={undefined}
        >
          <div className={styles.body}>
            <Dialog.Title className={styles.dialogTitle}>{t('office.send.title')}</Dialog.Title>
            {k === 'load-failed' ? (
              <InlineError message="office.send.recipient_failed" onRetry={retry} />
            ) : k === 'no-client' ? null : (
              <p className={styles.toLine}>
                <span className={styles.toLabel}>{t('office.send.to')}</span>
                {toValue}
              </p>
            )}
            {k === 'no-client' ? (
              <>
                <p data-testid="send-no-client" className={styles.message}>
                  {t('office.send.no_client')}
                </p>
                <StateButton
                  data-testid="send-project-settings"
                  className={styles.settingsButton}
                  onClick={() => {
                    onClose();
                    onOpenProjectSettings();
                  }}
                >
                  {t('office.send.project_settings')}
                </StateButton>
              </>
            ) : null}
            {showNote ? (
              <label className={styles.field}>
                {t('office.send.note')}
                <input
                  data-testid="send-note"
                  className={online ? styles.input : `${styles.input} ${offline.offline}`}
                  type="text"
                  maxLength={SEND_NOTE_MAX}
                  value={note}
                  readOnly={noteReadOnly}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            ) : null}
            {k === 'send-failed' || k === 'unsaved' ? (
              <p data-testid="send-error" role="alert" className={styles.error}>
                {t(k === 'unsaved' ? 'office.send.unsaved' : state.error)}
              </p>
            ) : null}
            {sent !== null ? (
              <p
                data-testid="send-status"
                data-email-sent={String(sent.emailSent)}
                className={styles.message}
              >
                {sent.emailSent
                  ? t('office.send.sent_to', { name: sent.recipient.name })
                  : t('office.send.email_failed')}
              </p>
            ) : null}
            {sent !== null && sent.holder !== null ? (
              <p data-testid="send-holder-notice" className={styles.notice}>
                {sent.holder.savedAt === null
                  ? t('office.send.holder_notice_no_time', { name: sent.holder.name })
                  : t('office.send.holder_notice', {
                      name: sent.holder.name,
                      time: formatClock(Date.parse(sent.holder.savedAt)),
                    })}
              </p>
            ) : null}
          </div>
          <div className={styles.footer}>
            <span className={styles.footerSpacer} />
            <StateButton data-testid="send-cancel" onClick={onClose}>
              {t(k === 'sent' ? 'common.close' : 'common.cancel')}
            </StateButton>
            {sent !== null ? (
              <StateButton
                data-testid="send-copy-link"
                data-link={sent.link}
                onClick={() => onCopy(sent.link)}
              >
                {t('office.send.copy_link')}
              </StateButton>
            ) : null}
            {k === 'no-client' || k === 'load-failed' ? null : (
              <StateButton
                data-testid="send-submit"
                variant="primary"
                className={styles.sendButton}
                disabled={!sendable}
                onClick={() => void onSend()}
              >
                {t(k === 'sending' ? 'office.send.sending' : 'office.send.send')}
              </StateButton>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
