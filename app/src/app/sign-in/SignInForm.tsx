'use client';
// EZD-007f Step 7 (vault/plans/EZD-007f.md section 3; Q-0035 note; Q-0100; Q-0169 (a); Q-0170 (b)).
// Step 1 asks for the email; step 2 tells the user to check spam and takes the 6-digit code. The emailed
// link, token hash and code are never shown. Next's redirect after a sign-in is rethrown, never caught.
import { useActionState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import { clearSignInEmail, requestSignIn, verifySignInCode } from '../../server/auth/actions';
import styles from '../../components/auth/auth.module.css';

type SignInError =
  'invalid_email' | 'too_many_requests' | 'code_invalid' | 'no_access' | 'sign_in_failed';

type State = { email: string | null; error: SignInError | null };

async function run(prev: State, formData: FormData): Promise<State> {
  try {
    if (prev.email === null) {
      const result = await requestSignIn(formData);
      if ('error' in result) return { email: null, error: result.error };
      const email = formData.get('email');
      return { email: typeof email === 'string' ? email.trim().toLowerCase() : '', error: null };
    }
    if (formData.get('intent') === 'change_email') {
      await clearSignInEmail();
      return { email: null, error: null };
    }
    const result = await verifySignInCode(formData);
    return { email: prev.email, error: result.error };
  } catch (error) {
    unstable_rethrow(error);
    return { email: prev.email, error: 'sign_in_failed' };
  }
}

export function SignInForm({
  initialEmail,
  initialError,
}: {
  initialEmail: string | null;
  initialError: 'no_access' | null;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(run, {
    email: initialEmail,
    error: initialError,
  });

  const error = state.error ? (
    <p className={styles.error} role="alert" data-testid="sign-in-error">
      {t(`error.${state.error}` as MessageKey)}
    </p>
  ) : null;

  if (state.email === null) {
    return (
      <form action={action} className={styles.form}>
        <label className={styles.label} htmlFor="sign-in-email">
          {t('common.sign_in.email_label')}
        </label>
        <input
          id="sign-in-email"
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          data-testid="sign-in-email"
        />
        {error}
        <button
          type="submit"
          className={styles.primary}
          disabled={pending}
          data-testid="sign-in-submit"
        >
          {t('common.sign_in.send')}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className={styles.form}>
      <p className={styles.text}>{t('common.sign_in.sent', { email: state.email })}</p>
      <p className={styles.secondaryText} data-testid="sign-in-check-spam">
        {t('common.sign_in.check_spam')}
      </p>
      <input type="hidden" name="email" value={state.email} />
      <label className={styles.label} htmlFor="sign-in-code">
        {t('common.sign_in.code_label')}
      </label>
      <input
        id="sign-in-code"
        className={`${styles.input} ${styles.code}`}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        data-testid="sign-in-code"
      />
      {error}
      <button
        type="submit"
        className={styles.primary}
        disabled={pending}
        data-testid="sign-in-code-submit"
      >
        {t('common.sign_in.code_submit')}
      </button>
      <button
        type="submit"
        name="intent"
        value="change_email"
        formNoValidate
        className={styles.secondary}
        disabled={pending}
        data-testid="sign-in-change-email"
      >
        {t('common.sign_in.change_email')}
      </button>
    </form>
  );
}
