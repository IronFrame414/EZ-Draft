// EZD-712 (S15c; Q-0214; ARCH Settings shell page contract): Settings > Sheet presets. Without
// settings_sheet_presets the no-access line in place (HTTP 200, URL unchanged); a failed load is reported
// (`sheet_presets_load_failed`) and shows the inline error with Retry. This static folder takes precedence over
// [section].
import { connection } from 'next/server';
import {
  SheetPresetsLoadError,
  SheetPresetsPage,
} from '../../../../components/settings/sheet-presets/SheetPresetsPage';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import type { SubmittalProfile } from '../../../../lib/submittal-profiles/profiles';
import { requireSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportError } from '../../../../server/errors/report';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';
import { listSubmittalProfiles } from '../../../../server/submittal-profiles/submittal-profiles';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_sheet_presets')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  let profiles: SubmittalProfile[] | null = null;
  try {
    profiles = await listSubmittalProfiles(createSessionClient());
  } catch {
    profiles = null;
  }
  if (profiles === null) {
    // Code only, never the caught message (ARCH Errors and logging).
    await reportError(new Error('sheet_presets_load_failed'), {
      source: 'function',
      location: 'settings.sheet_presets',
    });
    return <SheetPresetsLoadError />;
  }
  return <SheetPresetsPage initial={profiles} />;
}
