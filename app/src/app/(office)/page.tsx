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
import { valueOf } from '../../server/settled';
import styles from '../../components/projects/Projects.module.css';

export default async function ProjectsPage(): Promise<ReactElement> {
  // Render per request: without Supabase settings at build time requireSession() never reads the
  // cookies, so Next.js would otherwise prerender a permanent redirect to /sign-in.
  await connection();
  const session = await requireSession();
  // EZD-1994 (performance audit 2026-11-26, Q-0814): the permissions and the account do not depend on each other,
  // so both reads start together and the page waits for the slower one, not for their sum. The answers are taken in
  // the old order (server/settled.ts), so a failed permission load is still reported when the account read fails.
  const [ctxRead, accountRead] = await Promise.allSettled([
    settingsPermissionContext(),
    loadProjectsAccount(createSessionClient(), session),
  ]);
  const ctx = valueOf(ctxRead);
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
  // EZD-124 (Q-0700 decisions 10): the card menu's Rename and Set status need Edit model; Archive, Restore and
  // Delete need Delete projects.
  const canEdit = ctx !== 'failed' && can(ctx, 'edit_model');
  const canDelete = ctx !== 'failed' && can(ctx, 'delete_projects');
  // EZD-1419 (S17b Entry points; Q-0178): every card offers Field measure to a member who may measure (Send field
  // measurement) or reopen sent rooms (Approve field measurements); a viewer still opens the screen by its link
  // (vault/build/assumptions.md EZD-1419).
  const canMeasure =
    ctx !== 'failed' &&
    (can(ctx, 'send_field_measurement') || can(ctx, 'approve_field_measurements'));
  const account = { ...valueOf(accountRead), showSettings };
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <div className={styles.page}>
          {allowed ? (
            <ProjectsView
              account={account}
              canCreate={canCreate}
              canImport={canImport}
              canEdit={canEdit}
              canDelete={canDelete}
              canMeasure={canMeasure}
            />
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
