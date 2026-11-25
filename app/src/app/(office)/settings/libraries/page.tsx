// EZD-131 (S15h; AC-EZD-131-1; Q-0225): Settings > Libraries. Without the Libraries switch, the no-access line
// in place (HTTP 200, URL unchanged). This static folder takes precedence over [section].
// EZD-1408 (S15h Permissions "Edit field tasks may also edit field task templates. Without either, the section is
// hidden"): with Edit field tasks and no Libraries switch, only the Field task templates tab shows.
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
  const full = can(ctx, 'settings_libraries');
  if (!full && !can(ctx, 'edit_field_tasks')) {
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
      {full ? <LibrariesPanel /> : <LibrariesPanel initialTab="task_templates" onlyTemplates />}
    </SettingsMain>
  );
}
