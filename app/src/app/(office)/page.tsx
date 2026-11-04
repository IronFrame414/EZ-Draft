// EZD-117a Step 14 (vault/plans/EZD-117a.md Decided "Route of the page", "Page server part", "Settings link and
// Sign out stand-ins"; S01 Permissions; ARCH Entry points): the Projects page at `/`, replacing the signed-in
// home. It requires a session; without View projects it shows No access in place (on a failed permission load
// the routes answer). The Settings link (EZD-289, only to a user who may open Settings; a failed load hides it
// and reports once) and Sign out stay at the right of the title row until EZD-117b's header replaces them.
import Link from 'next/link';
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { SignOutButton } from '../../components/auth/SignOutButton';
import { Disclaimer } from '../../components/disclaimer/Disclaimer';
import { ProjectsNoAccessView, ProjectsView } from '../../components/projects/ProjectsView';
import { StateHost } from '../../components/states/StateHost';
import { MessagesProvider } from '../../lib/messages';
import { mayOpenSettings } from '../../lib/settings/sections';
import { requireSession } from '../../server/auth/session';
import { reportError } from '../../server/errors/report';
import { catalogFor } from '../../server/messages/catalog';
import { getT } from '../../server/messages/get-t';
import { can } from '../../server/permissions';
import { settingsPermissionContext } from '../../server/settings/shell-data';
import styles from '../../components/projects/Projects.module.css';

export default async function ProjectsPage(): Promise<ReactElement> {
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
  const allowed = ctx === 'failed' || can(ctx, 'view_projects');
  const showSettings = ctx !== 'failed' && mayOpenSettings((p) => can(ctx, p));
  const actions = (
    <>
      {showSettings ? (
        <Link
          href="/settings"
          prefetch={false}
          data-testid="home-settings"
          className={styles.settingsLink}
        >
          {getT('office', 'en')('office.home.settings')}
        </Link>
      ) : null}
      <SignOutButton />
    </>
  );
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <div className={styles.page}>
          {allowed ? (
            <ProjectsView actions={actions} />
          ) : (
            <ProjectsNoAccessView actions={actions} />
          )}
          <Disclaimer placement="page" />
        </div>
      </StateHost>
    </MessagesProvider>
  );
}
