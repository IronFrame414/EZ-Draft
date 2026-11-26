// EZD-136 Step 17 (vault/plans/EZD-136.md section 3; Q-0273 (b); Q-0305 (c)): the app's not-found page,
// status 404, for every URL no route matches and every notFound() with no nearer not-found file. The text
// and the disclaimer line in the person's language (getNotFoundLanguage).
// EZD-1990 (Q-0808; AC-EZD-1990-1): signed in, the page has the Projects page's shell: the normal app header
// (English, as the office screens are), the message centred with a "Back to Projects" button that opens
// Projects, and the disclaimer in the sticky footer. Signed out, or when who is signed in cannot be read, the
// page is as before. It never fails: a failed header load is reported and shows the bare page. The header
// loads as its own chunk (not-found-header.tsx) so the other entries' downloads stay as they were.
// EZD-1996: the frame and footer styles are this page's own (home.module.css), not the Projects page's CSS module,
// which this file's place in every route's tree put on every page.
import type { JSX } from 'react';
import { Disclaimer } from '../components/disclaimer/Disclaimer';
import type { ProjectsAccount } from '../components/projects/ProjectsHeader';
import { MessagesProvider } from '../lib/messages';
import type { Language } from '../lib/messages/types';
import { mayOpenSettings } from '../lib/settings/sections';
import { getSession } from '../server/auth/session';
import { createSessionClient } from '../server/auth/supabase-server';
import { reportError } from '../server/errors/report';
import { catalogFor } from '../server/messages/catalog';
import { getT } from '../server/messages/get-t';
import { getNotFoundLanguage } from '../server/messages/not-found-language';
import { can } from '../server/permissions';
import { loadProjectsAccount } from '../server/projects/account';
import { settingsPermissionContext } from '../server/settings/shell-data';
import styles from './home.module.css';
import { NotFoundBack, NotFoundHeader } from './not-found-header';

// The signed-in header's account, or null for the bare page (signed out, or a failed read, reported).
async function headerAccount(): Promise<ProjectsAccount | null> {
  try {
    const session = await getSession();
    if (session === null) return null;
    const ctx = await settingsPermissionContext();
    if (ctx === 'failed') {
      await reportError(new Error('not_found_permissions_load_failed'), {
        source: 'function',
        location: 'not_found.settings_link',
      });
    }
    const showSettings = ctx !== 'failed' && mayOpenSettings((p) => can(ctx, p));
    return { ...(await loadProjectsAccount(createSessionClient(), session)), showSettings };
  } catch (error) {
    await reportError(error, { source: 'function', location: 'not_found.header' });
    return null;
  }
}

function BarePage({ language }: { language: Language }): JSX.Element {
  const t = getT('sign_in', language);
  return (
    <main className={styles.page}>
      <MessagesProvider language={language} messages={catalogFor('sign_in', language)}>
        <p className={styles.message} data-testid="not-found">
          {t('error.page_not_found')}
        </p>
        <Disclaimer placement="page" />
      </MessagesProvider>
    </main>
  );
}

export default async function NotFound(): Promise<JSX.Element> {
  const language = await getNotFoundLanguage();
  const account = await headerAccount();
  if (account === null) return <BarePage language={language} />;
  const t = getT('sign_in', language);
  const messages = catalogFor('sign_in', language);
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <div className={styles.signedInPage}>
        <NotFoundHeader account={account} />
        <main className={styles.centred}>
          <MessagesProvider language={language} messages={messages}>
            <div className={styles.centredInner}>
              <p className={styles.message} data-testid="not-found">
                {t('error.page_not_found')}
              </p>
              <NotFoundBack label={t('common.back_to_projects')} />
            </div>
          </MessagesProvider>
        </main>
        <div className={styles.signedInFooter} data-testid="not-found-footer">
          <MessagesProvider language={language} messages={messages}>
            <Disclaimer placement="page" />
          </MessagesProvider>
        </div>
      </div>
    </MessagesProvider>
  );
}
