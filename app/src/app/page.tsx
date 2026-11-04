// EZD-007f Step 10 (vault/plans/EZD-007f.md section 3; Q-0039 (c); R26 R17; Q-0121 (a)): the signed-in
// home until Phase 1: it requires a session, in office English, with the disclaimer line below it (EZD-136
// Step 12). EZD-289 (vault/plans/EZD-289.md sections 1, 3, 4): the top row adds a Settings link next to Sign
// out, shown only to a user who may open Settings; a failed permission load hides it and reports once.
import Link from 'next/link';
import { connection } from 'next/server';
import { SignOutButton } from '../components/auth/SignOutButton';
import { Disclaimer } from '../components/disclaimer/Disclaimer';
import { MessagesProvider } from '../lib/messages';
import { mayOpenSettings } from '../lib/settings/sections';
import { requireSession } from '../server/auth/session';
import { catalogFor } from '../server/messages/catalog';
import { getT } from '../server/messages/get-t';
import { can } from '../server/permissions';
import { reportError } from '../server/errors/report';
import { settingsPermissionContext } from '../server/settings/shell-data';
import styles from './home.module.css';

export default async function Page() {
  // Render per request: without Supabase settings at build time requireSession() never reads the
  // cookies, so Next.js would otherwise prerender a permanent redirect to /sign-in.
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  if (ctx === 'failed') {
    await reportError(new Error('home_permissions_load_failed'), {
      source: 'function',
      location: 'home.settings_link',
    });
  }
  const showSettings = ctx !== 'failed' && mayOpenSettings((p) => can(ctx, p));
  const t = getT('office', 'en');
  return (
    <main className={styles.page}>
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <div className={styles.top}>
          {showSettings ? (
            <Link
              href="/settings"
              prefetch={false}
              data-testid="home-settings"
              className={styles.settingsLink}
            >
              {t('office.home.settings')}
            </Link>
          ) : null}
          <SignOutButton />
        </div>
        <Disclaimer placement="page" />
      </MessagesProvider>
    </main>
  );
}
