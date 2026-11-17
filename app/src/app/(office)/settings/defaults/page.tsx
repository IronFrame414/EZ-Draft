// EZD-116 (S15d; Q-0697 decisions 10 "Phase 8 permissions"; Q-0210; Q-0214; ARCH Settings shell page contract):
// Settings > Defaults. Without settings_defaults the no-access line in place (HTTP 200, URL unchanged); a
// failed load is reported (`defaults_load_failed`) and shows the inline error with Retry. This static folder
// takes precedence over [section].
import { connection } from 'next/server';
import { DefaultsLoadError, DefaultsPage } from '../../../../components/settings/defaults/DefaultsForm';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import type { StoredDefaults } from '../../../../lib/defaults/values';
import { requireSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { loadTenantDefaults } from '../../../../server/defaults/defaults';
import { reportError } from '../../../../server/errors/report';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_defaults')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  let stored: StoredDefaults | null = null;
  try {
    stored = await loadTenantDefaults(createSessionClient());
  } catch {
    stored = null;
  }
  if (stored === null) {
    // Code only, never the caught message (ARCH Errors and logging).
    await reportError(new Error('defaults_load_failed'), {
      source: 'function',
      location: 'settings.defaults',
    });
    return <DefaultsLoadError />;
  }
  return <DefaultsPage initial={stored} />;
}
