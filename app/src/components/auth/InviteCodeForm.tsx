'use client';
// EZD-138 (S15 board S15j "Invite code · open", "Wrong email or wrong code · one message", "Locked after 5 wrong
// codes"; Q-0695 decisions 10 row 61; Q-0216): "Join with an invite code" on /sign-in. The invitee types the
// email the invite was sent to and the 6-digit code; Join accepts the invite and lands on Projects signed in.
// One message for a wrong email or a wrong code (W9). EZD-2021 (audit 2026-11-27 X4; AC-EZD-2021-1): a locked
// code gets that same message here (the lock shows only on the emailed link's page), so Join is never held off.
// Next's redirect after the accept is rethrown, never caught.
import { useActionState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import { acceptInviteCode } from '../../server/auth/actions';
import styles from './auth.module.css';

type InviteCodeError =
  | 'invite_code_invalid'
  | 'code_throttled'
  | 'ip_throttled'
  | 'unavailable'
  | 'sign_in_failed';

type State = { error: InviteCodeError | null; typedEmail: string | null; tries: number };

async function run(prev: State, formData: FormData): Promise<State> {
  const field = formData.get('email');
  const typedEmail = typeof field === 'string' ? field : '';
  const tries = prev.tries + 1;
  try {
    const result = await acceptInviteCode(formData);
    return { error: result.error, typedEmail, tries };
  } catch (error) {
    unstable_rethrow(error);
    return { error: 'sign_in_failed', typedEmail, tries };
  }
}

export function InviteCodeForm({
  initialEmail,
  next = null,
  onBack,
}: {
  initialEmail: string | null;
  // EZD-1977: the checked page to land on after Join (null: Projects).
  next?: string | null;
  onBack: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(run, {
    error: null,
    typedEmail: null,
    tries: 0,
  });

  return (
    <form
      action={action}
      className={styles.form}
      data-testid="invite-code-form"
      data-tries={state.tries}
    >
      <p className={styles.text}>{t('common.sign_in.invite_code_intro')}</p>
      {next !== null && <input type="hidden" name="next" value={next} />}
      {state.error ? (
        <p className={styles.error} role="alert" data-testid="invite-code-error">
          {t(
            state.error === 'unavailable'
              ? 'error.db_unavailable'
              : (`error.${state.error}` as MessageKey),
          )}
        </p>
      ) : null}
      <label className={styles.label} htmlFor="invite-code-email">
        {t('common.sign_in.email_label')}
      </label>
      <input
        id="invite-code-email"
        className={styles.input}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.typedEmail ?? initialEmail ?? ''}
        data-testid="invite-code-email"
      />
      <label className={styles.label} htmlFor="invite-code-code">
        {t('common.sign_in.invite_code_label')}
      </label>
      <input
        id="invite-code-code"
        className={`${styles.input} ${styles.code}`}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        required
        data-testid="invite-code-code"
      />
      <button
        type="submit"
        className={styles.primary}
        disabled={pending}
        data-testid="invite-code-submit"
      >
        {t('common.sign_in.invite_code_submit')}
      </button>
      <button
        type="button"
        className={styles.textButton}
        disabled={pending}
        onClick={onBack}
        data-testid="invite-code-back"
      >
        {t('common.sign_in.invite_code_back')}
      </button>
    </form>
  );
}
