'use client';
// EZD-105 (Q-0695 decisions 10 row 61; AC-EZD-105-4): the invite is accepted only when Accept is pressed,
// never on GET (mail scanners would spend it). Next's redirect after the accept is rethrown, never caught.
import { useActionState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { useT } from '../../../lib/messages';
import { acceptInvite } from '../../../server/auth/actions';
import styles from '../../../components/auth/auth.module.css';

type AcceptError = 'invite_invalid' | 'unavailable';

async function run(_prev: AcceptError | null, formData: FormData): Promise<AcceptError | null> {
  try {
    return (await acceptInvite(formData)).error;
  } catch (error) {
    unstable_rethrow(error);
    return 'unavailable';
  }
}

export function InviteAcceptForm({ token }: { token: string }) {
  const t = useT();
  const [error, action, pending] = useActionState(run, null);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="token" value={token} />
      {error ? (
        <p className={styles.error} role="alert" data-testid="invite-error">
          {t(error === 'invite_invalid' ? 'common.invite.invalid' : 'common.invite.failed')}
        </p>
      ) : (
        <p data-testid="invite-intro">{t('common.invite.intro')}</p>
      )}
      <button
        type="submit"
        className={styles.primary}
        disabled={pending || error === 'invite_invalid'}
        data-testid="invite-accept"
      >
        {t('common.invite.accept')}
      </button>
    </form>
  );
}
