'use client';
// EZD-007f Step 7 (vault/plans/EZD-007f.md section 3; Q-0035 note; Q-0100; Q-0169 (a); Q-0170 (b)).
// Step 1 asks for the email; step 2 tells the user to check spam and takes the 6-digit code. The emailed
// link, token hash and code are never shown. Next's redirect after a sign-in is rethrown, never caught.
import { useActionState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import {
  clearSignInEmail,
  requestSignIn,
  signInWithPassword,
  verifySignInCode,
} from '../../server/auth/actions';
import styles from '../../components/auth/auth.module.css';

// EZD-033 Step 6 (vault/plans/EZD-033.md; Q-0091; Q-0101): step 1 is email and password first, then
// "Email me a sign-in link instead" and "Forgot password? Email me a code" (both send the normal sign-in
// email through requestSignIn). The email box keeps what was typed; the password box is never refilled.
type SignInError =
  | 'invalid_email'
  | 'too_many_requests'
  | 'code_invalid'
  | 'no_access'
  | 'sign_in_failed'
  | 'password_wrong'
  | 'password_throttled'
  | 'code_throttled'
  | 'email_throttled'
  | 'ip_throttled'
  | 'unavailable';

type State = { email: string | null; error: SignInError | null; typedEmail: string | null };

async function run(prev: State, formData: FormData): Promise<State> {
  const field = formData.get('email');
  // Step 1 results keep the email box as typed; the code step keeps the earlier value.
  const typedEmail =
    prev.email === null ? (typeof field === 'string' ? field : '') : prev.typedEmail;
  try {
    if (prev.email === null) {
      const intent = formData.get('intent');
      if (intent === 'send' || intent === 'forgot') {
        const result = await requestSignIn(formData);
        if ('error' in result) return { email: null, error: result.error, typedEmail };
        return { email: (typedEmail ?? '').trim().toLowerCase(), error: null, typedEmail };
      }
      const result = await signInWithPassword(formData);
      return { email: null, error: result.error, typedEmail };
    }
    if (formData.get('intent') === 'change_email') {
      await clearSignInEmail();
      return { email: null, error: null, typedEmail: null };
    }
    const result = await verifySignInCode(formData);
    return { email: prev.email, error: result.error, typedEmail };
  } catch (error) {
    unstable_rethrow(error);
    return { email: prev.email, error: 'sign_in_failed', typedEmail };
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
    typedEmail: null,
  });

  const error = state.error ? (
    <p className={styles.error} role="alert" data-testid="sign-in-error">
      {t(
        state.error === 'unavailable'
          ? 'error.db_unavailable'
          : (`error.${state.error}` as MessageKey),
      )}
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
          defaultValue={state.typedEmail ?? ''}
          data-testid="sign-in-email"
        />
        <label className={styles.label} htmlFor="sign-in-password">
          {t('common.sign_in.password_label')}
        </label>
        <input
          id="sign-in-password"
          className={styles.input}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          data-testid="sign-in-password"
        />
        {error}
        <button
          type="submit"
          name="intent"
          value="password"
          className={styles.primary}
          disabled={pending}
          data-testid="sign-in-password-submit"
        >
          {t('common.sign_in.password_submit')}
        </button>
        <button
          type="submit"
          name="intent"
          value="send"
          formNoValidate
          className={styles.secondary}
          disabled={pending}
          data-testid="sign-in-submit"
        >
          {t('common.sign_in.send_instead')}
        </button>
        <button
          type="submit"
          name="intent"
          value="forgot"
          formNoValidate
          className={styles.textButton}
          disabled={pending}
          data-testid="sign-in-forgot"
        >
          {t('common.sign_in.forgot')}
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
