'use client';
// EZD-007f Step 5 (vault/plans/EZD-007f.md section 3; P-Step 5): Sign out on this device only.
// EZD-120d Build step 12 (vault/plans/EZD-120d.md Decided "Sign-out order"): the submit is always prevented.
// The caller's check (EZD-134, EZD-108) can refuse, then queued edits are sent first or asked about, then the
// sign-out runs. A press during the check is ignored.
import { useRef, useTransition } from 'react';
import type { FormEvent } from 'react';
import { signOutOnDevice } from '../../lib/auth/device-sign-out';
import { useT } from '../../lib/messages';
import { signOut } from '../../server/auth/actions';
import { useOutboxSignOut } from '../outbox/OutboxDrain';
import styles from './auth.module.css';

type BeforeSignOut = () => boolean | Promise<boolean>;

export async function confirmSignOut(beforeSignOut?: BeforeSignOut): Promise<boolean> {
  return beforeSignOut ? await beforeSignOut() : true;
}

export function SignOutButton({ beforeSignOut }: { beforeSignOut?: BeforeSignOut }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const { check, dialog } = useOutboxSignOut();
  const checkingRef = useRef(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (checkingRef.current) return;
    checkingRef.current = true;
    void (async () => {
      try {
        if (!(await confirmSignOut(beforeSignOut))) return;
        if (!(await check())) return;
        startTransition(async () => {
          await signOutOnDevice(signOut);
        });
      } finally {
        checkingRef.current = false;
      }
    })();
  };

  return (
    <form action={signOut} onSubmit={onSubmit}>
      <button type="submit" disabled={pending} className={styles.secondary} data-testid="sign-out">
        {t('common.sign_in.sign_out')}
      </button>
      {dialog}
    </form>
  );
}
