'use client';
// EZD-007f Step 5 (vault/plans/EZD-007f.md section 3; P-Step 5): Sign out on this device only.
// beforeSignOut (EZD-134, EZD-108) can refuse: an async check cannot cancel a started submit, so with a
// hook the submit is always prevented and signOut() runs only when the hook answers true.
import { useTransition } from 'react';
import type { FormEvent } from 'react';
import { useT } from '../../lib/messages';
import { signOut } from '../../server/auth/actions';
import styles from './auth.module.css';

type BeforeSignOut = () => boolean | Promise<boolean>;

export async function confirmSignOut(beforeSignOut?: BeforeSignOut): Promise<boolean> {
  return beforeSignOut ? await beforeSignOut() : true;
}

export function SignOutButton({ beforeSignOut }: { beforeSignOut?: BeforeSignOut }) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  const onSubmit = beforeSignOut
    ? (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void confirmSignOut(beforeSignOut).then((ok) => {
          if (ok) {
            startTransition(async () => {
              await signOut();
            });
          }
        });
      }
    : undefined;

  return (
    <form action={signOut} onSubmit={onSubmit}>
      <button type="submit" disabled={pending} className={styles.secondary} data-testid="sign-out">
        {t('common.sign_in.sign_out')}
      </button>
    </form>
  );
}
