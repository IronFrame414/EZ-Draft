'use client';
// EZD-007f Step 8 (vault/plans/EZD-007f.md section 3; Q-0169 (a); Q-0170 (b)): the link is verified only
// when the button is pressed, never on GET (mail scanners would spend the token). Next's redirect after a
// sign-in is rethrown, never caught.
import { useActionState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { useT } from '../../../lib/messages';
import type { MessageKey } from '../../../server/messages/catalog';
import { confirmSignInLink } from '../../../server/auth/actions';
import styles from '../../../components/auth/auth.module.css';

type ConfirmError = 'link_invalid' | 'no_access' | 'too_many_requests' | 'sign_in_failed';

async function run(_prev: ConfirmError | null, formData: FormData): Promise<ConfirmError | null> {
  try {
    return (await confirmSignInLink(formData)).error;
  } catch (error) {
    unstable_rethrow(error);
    return 'sign_in_failed';
  }
}

export function ConfirmForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const t = useT();
  const [error, action, pending] = useActionState(run, null);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      {error ? (
        <p className={styles.error} role="alert" data-testid="confirm-error">
          {t(`error.${error}` as MessageKey)}
        </p>
      ) : null}
      <button
        type="submit"
        className={styles.primary}
        disabled={pending}
        data-testid="confirm-submit"
      >
        {t('common.sign_in.confirm_submit')}
      </button>
    </form>
  );
}
