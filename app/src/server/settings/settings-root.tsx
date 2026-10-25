// EZD-103a Step 9 (vault/plans/EZD-103a.md Decided "Root", "Nav filtering", "Load failure"; Q-0121 (a)):
// the Settings layout's server part. It loads the shell data, filters the nav on the server and renders the
// shell around the page, or the load error (reported with its code only) when the data cannot be read.
// EZD-103b Step 9 (vault/plans/EZD-103b.md Decided "Draft lifetime"): the shell's draft scope is the
// membership, or the user when there is no permission context.
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { SettingsLoadError, SettingsShell } from '../../components/settings/SettingsShell';
import { StateHost } from '../../components/states/StateHost';
import { MessagesProvider } from '../../lib/messages';
import { allowedSections } from '../../lib/settings/sections';
import { requireSession } from '../auth/session';
import { createSessionClient } from '../auth/supabase-server';
import { reportError } from '../errors/report';
import { catalogFor } from '../messages/catalog';
import { can } from '../permissions';
import { loadSettingsShellData, settingsPermissionContext } from './shell-data';

export async function SettingsRoot({ children }: { children: ReactNode }) {
  await connection();
  const session = await requireSession();
  const ctx = await settingsPermissionContext();
  const data =
    ctx === 'failed' ? null : await loadSettingsShellData(createSessionClient(), session, ctx);
  if (data === null) {
    await reportError(new Error('settings_shell_load_failed'), {
      source: 'function',
      location: 'settings.shell',
    });
  }
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        {data === null || ctx === 'failed' ? (
          <SettingsLoadError />
        ) : (
          <SettingsShell
            companyName={data.companyName}
            initials={data.initials}
            allowed={allowedSections((p) => can(ctx, p)).map((s) => s.id)}
            activeMembers={data.activeMembers}
            draftScope={ctx?.membershipId ?? session.appUserId}
          >
            {children}
          </SettingsShell>
        )}
      </StateHost>
    </MessagesProvider>
  );
}
