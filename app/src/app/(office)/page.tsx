// EZD-117a Step 14 (vault/plans/EZD-117a.md Decided "Route of the page", "Page server part", "Settings link and
// Sign out stand-ins"; S01 Permissions; ARCH Entry points): the Projects page at `/`, replacing the signed-in
// home. It requires a session; without View projects it shows No access in place (on a failed permission load
// the routes answer). The settings gear keeps EZD-289's rule: only a user who may open Settings sees it; a
// failed load hides it and reports once.
// EZD-117b Build step 13 (vault/plans/EZD-117b.md Decided "Page server part", "Settings gear rule"; S01
// Permissions): the header replaces both stand-ins (the settings gear and the avatar menu, which signs out);
// the page passes the account and Create projects to the views.
// EZD-335 (vault/plans/EZD-335.md Build step 2; Q-0229; AC-EZD-335-1): the disclaimer sits in a sticky footer so it stays in view over a long list.
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { Disclaimer } from '../../components/disclaimer/Disclaimer';
import { ProjectsNoAccessView, ProjectsView } from '../../components/projects/ProjectsView';
import { StateHost } from '../../components/states/StateHost';
import { MessagesProvider } from '../../lib/messages';
import { mayOpenSettings } from '../../lib/settings/sections';
import { requireSession } from '../../server/auth/session';
import { createSessionClient } from '../../server/auth/supabase-server';
import { reportError } from '../../server/errors/report';
import { catalogFor } from '../../server/messages/catalog';
import { can } from '../../server/permissions';
import { loadProjectsAccount } from '../../server/projects/account';
import { settingsPermissionContext } from '../../server/settings/shell-data';
import styles from '../../components/projects/Projects.module.css';

export default async function ProjectsPage(): Promise<ReactElement> {
  // Render per request: without Supabase settings at build time requireSession() never reads the
  // cookies, so Next.js would otherwise prerender a permanent redirect to /sign-in.
  await connection();
  const session = await requireSession();
  const ctx = await settingsPermissionContext();
  if (ctx === 'failed') {
    await reportError(new Error('home_permissions_load_failed'), {
      source: 'function',
      location: 'home.settings_link',
    });
  }
  const allowed = ctx === 'failed' || can(ctx, 'view_projects');
  const showSettings = ctx !== 'failed' && mayOpenSettings((p) => can(ctx, p));
  const canCreate = ctx !== 'failed' && can(ctx, 'create_projects');
  // EZD-301 (S02 Permissions): starting from a file also needs Edit model (every import review action does).
  const canImport = ctx !== 'failed' && can(ctx, 'create_projects') && can(ctx, 'edit_model');
  const account = {
    ...(await loadProjectsAccount(createSessionClient(), session)),
    showSettings,
  };
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <div className={styles.page}>
          {allowed ? (
            <ProjectsView account={account} canCreate={canCreate} canImport={canImport} />
          ) : (
            <ProjectsNoAccessView account={account} />
          )}
          <div className={styles.footer} data-testid="projects-footer">
            <Disclaimer placement="page" />
          </div>
        </div>
      </StateHost>
    </MessagesProvider>
  );
}
