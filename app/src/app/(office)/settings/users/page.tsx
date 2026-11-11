// EZD-104 Build step 19 (vault/plans/EZD-104.md Decided "Page"; S15; AC-EZD-104-5; Q-0214; Q-0695): Settings >
// Users + permissions. Without the Users switch, the no-access line in place (HTTP 200, URL unchanged). The
// panel loads its rows in the browser through GET /api/settings/users. This static folder takes precedence
// over [section].
import { connection } from 'next/server';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { UsersPanel } from '../../../../components/settings/users/UsersPanel';
import { NoAccess } from '../../../../components/states/NoAccess';
import { requireSession } from '../../../../server/auth/session';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_users')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  return <UsersPanel />;
}
