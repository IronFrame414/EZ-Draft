// EZD-131 (S15h; AC-EZD-131-1; Q-0225): Settings > Libraries. Without the Libraries switch, the no-access line
// in place (HTTP 200, URL unchanged). This static folder takes precedence over [section].
import { connection } from 'next/server';
import { LibrariesPanel } from '../../../../components/settings/libraries/LibrariesPanel';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
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
  if (!can(ctx, 'settings_libraries')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  return (
    <SettingsMain
      section="libraries"
      title="office.settings.section.libraries"
      subtitle="office.libraries.subtitle"
    >
      <LibrariesPanel />
    </SettingsMain>
  );
}
