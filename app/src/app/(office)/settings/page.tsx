// EZD-103a Step 11 (vault/plans/EZD-103a.md Decided "Index"; AC-EZD-103-4; Q-0214, Q-0232): /settings opens
// the first section the user may open, in nav order; with none, the no-access line in place.
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { SettingsMain } from '../../../components/settings/SettingsShell';
import { NoAccess } from '../../../components/states/NoAccess';
import { allowedSections, settingsHref } from '../../../lib/settings/sections';
import { requireSession } from '../../../server/auth/session';
import { can } from '../../../server/permissions';
import { settingsPermissionContext } from '../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  const first = allowedSections((p) => can(ctx, p))[0];
  if (first) redirect(settingsHref(first));
  return (
    <SettingsMain>
      <NoAccess />
    </SettingsMain>
  );
}
