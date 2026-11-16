// EZD-135b Build step 6 (vault/plans/EZD-135b.md Decided "Who may open the page"; AC-EZD-135-1; Q-0225): Settings > System status.
// This static folder takes precedence over [section].
// EZD-237 (vault/plans/EZD-237.md D-Who; Q-0664): the Benchmark card for everyone with System status; its Run
// button only with Edit model too.
import { connection } from 'next/server';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import {
  SystemStatusPanel,
  SystemStatusProvider,
  SystemStatusRefresh,
} from '../../../../components/settings/system-status/SystemStatusPanel';
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
  if (!can(ctx, 'settings_system_status')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  return (
    <SystemStatusProvider>
      <SettingsMain
        section="system_status"
        title="office.settings.section.system_status"
        subtitle="office.system_status.subtitle"
        actions={<SystemStatusRefresh />}
      >
        <SystemStatusPanel benchmark={{ canRun: can(ctx, 'edit_model') }} />
      </SettingsMain>
    </SystemStatusProvider>
  );
}
