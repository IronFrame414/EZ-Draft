'use client';

// EZD-105b (vault/plans/EZD-105b.md Decided "Dialog steps", "Dialog error text", "Copy", "Offline", "Email
// failed"; Q-0096 P3, P10; Q-0733 (a)): the Owner-set password. A confirm step (it signs the member out
// everywhere and cannot be undone), then POST /api/settings/users/<id>/password with no body: there is no
// field, the server makes the password. It is shown once with Copy; closing the dialog unmounts it and the
// password is gone. While the request is out, Cancel, Escape and an overlay click are ignored, so a password
// made on the server is never lost unseen.
import { Dialog } from 'radix-ui';
import { useRef, useState } from 'react';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import type { UserRow } from '../../../lib/users/users';
import type { MessageKey } from '../../../server/messages/catalog';
import { Icon } from '../../icon/Icon';
import { StateButton } from '../../states/StateButton';
import { useToast } from '../../states/ToastProvider';
import { copyText } from './InviteDialog';
import roleStyles from './Roles.module.css';
import styles from './Users.module.css';

type Step =
  | { name: 'confirm'; error: MessageKey | null }
  | { name: 'pending' }
  | { name: 'shown'; password: string; emailSent: boolean };

const nameOf = (row: UserRow): string =>
  row.name !== null && row.name.trim() !== '' ? row.name : row.email;

async function bodyCode(res: Response): Promise<string | null> {
  const body: unknown = await res.json().catch(() => null);
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : null;
}

async function outcome(res: Response): Promise<Step> {
  if (res.status === 200) {
    const body: unknown = await res.json().catch(() => null);
    const b = body as { password?: unknown; emailSent?: unknown } | null;
    if (typeof b?.password === 'string' && b.password.length === 16 && typeof b.emailSent === 'boolean') {
      return { name: 'shown', password: b.password, emailSent: b.emailSent };
    }
    return { name: 'confirm', error: 'office.users.set_password_failed' };
  }
  if (res.status === 403) {
    const code = await bodyCode(res);
    return {
      name: 'confirm',
      error: code === 'password_target_refused' ? 'error.password_target_refused' : 'error.not_authorized',
    };
  }
  if (res.status === 404) return { name: 'confirm', error: 'error.member_not_found' };
  return { name: 'confirm', error: 'office.users.set_password_failed' };
}

export function SetPasswordDialog({ row, onClose }: { row: UserRow; onClose: () => void }) {
  const t = useT();
  const online = useOnline();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ name: 'confirm', error: null });
  const name = nameOf(row);
  const pending = step.name === 'pending';
  // One request per press: a double click lands before the re-render that disables the button.
  const sending = useRef(false);

  const send = async () => {
    if (sending.current || step.name !== 'confirm') return;
    sending.current = true;
    setStep({ name: 'pending' });
    try {
      const res = await fetch(`/api/settings/users/${row.membershipId}/password`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      setStep(await outcome(res));
    } catch {
      setStep({ name: 'confirm', error: 'office.users.set_password_failed' });
    } finally {
      sending.current = false;
    }
  };

  const copy = async (password: string) => {
    const ok = await copyText(password);
    toast.show({
      message: ok ? 'office.users.set_password_copied' : 'office.users.set_password_copy_failed',
    });
  };

  const hold = (e: Event) => {
    if (pending) e.preventDefault();
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={roleStyles.overlay} />
        <Dialog.Content
          data-testid="set-password-dialog"
          data-step={step.name}
          lang={t.language}
          className={roleStyles.content}
          aria-describedby={undefined}
          onEscapeKeyDown={hold}
          onPointerDownOutside={hold}
          onInteractOutside={hold}
        >
          <div className={styles.inviteHead}>
            <Icon name="key" size={20} />
            <Dialog.Title className={roleStyles.dialogTitle}>
              {t(
                step.name === 'shown'
                  ? 'office.users.set_password_shown_title'
                  : 'office.users.set_password_title',
                { name },
              )}
            </Dialog.Title>
          </div>
          {step.name === 'shown' ? (
            <>
              <div className={roleStyles.dialogBody}>
                <code data-testid="set-password-value" className={styles.passwordValue}>
                  {step.password}
                </code>
                <p className={styles.dialogText}>
                  {t('office.users.set_password_shown_help', { name })}
                </p>
                {step.emailSent ? null : (
                  <p
                    data-testid="set-password-email-failed"
                    role="alert"
                    className={`${roleStyles.fieldError} ${styles.inviteError}`}
                  >
                    <Icon name="error" size={16} />
                    {t('office.users.set_password_email_failed', { name })}
                  </p>
                )}
              </div>
              <div className={roleStyles.dialogFoot}>
                <StateButton data-testid="set-password-copy" onClick={() => void copy(step.password)}>
                  <Icon name="content_copy" size={16} />
                  {t('office.users.set_password_copy')}
                </StateButton>
                <StateButton data-testid="set-password-done" variant="primary" onClick={onClose}>
                  {t('office.users.set_password_done')}
                </StateButton>
              </div>
            </>
          ) : (
            <>
              <div className={roleStyles.dialogBody}>
                <p className={styles.dialogText}>{t('office.users.set_password_body', { name })}</p>
                {!online ? (
                  <p data-testid="set-password-offline" role="status" className={styles.dialogText}>
                    {t('office.users.set_password_offline')}
                  </p>
                ) : null}
                {step.name === 'confirm' && step.error !== null ? (
                  <p
                    data-testid="set-password-error"
                    role="alert"
                    className={`${roleStyles.fieldError} ${styles.inviteError}`}
                  >
                    <Icon name="error" size={16} />
                    {t(step.error)}
                  </p>
                ) : null}
              </div>
              <div className={roleStyles.dialogFoot}>
                <StateButton data-testid="set-password-cancel" disabled={pending} onClick={onClose}>
                  {t('common.cancel')}
                </StateButton>
                <StateButton
                  data-testid="set-password-confirm"
                  variant="primary"
                  disabled={pending || !online}
                  onClick={() => void send()}
                >
                  {t(pending ? 'office.users.set_password_pending' : 'office.users.set_password')}
                </StateButton>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
