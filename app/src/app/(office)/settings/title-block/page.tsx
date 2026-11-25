// EZD-709 (S15b; Q-0214; ARCH Settings shell page contract): Settings > Title block. Without
// settings_title_block the no-access line in place (HTTP 200, URL unchanged); a failed load is reported
// (`title_block_load_failed`) and shows the inline error with Retry. This static folder takes precedence over
// [section].
import { connection } from 'next/server';
import {
  TitleBlockLoadError,
  TitleBlockPage,
} from '../../../../components/settings/title-block/TitleBlockForm';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import type { TitleBlockSettings } from '../../../../lib/title-block/title-block';
import { requireSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { loadTitleBlockSettings } from '../../../../server/title-block/title-block';
import { reportError } from '../../../../server/errors/report';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_title_block')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  let settings: TitleBlockSettings | null = null;
  try {
    settings = await loadTitleBlockSettings(createSessionClient());
  } catch {
    settings = null;
  }
  if (settings === null) {
    // Code only, never the caught message (ARCH Errors and logging).
    await reportError(new Error('title_block_load_failed'), {
      source: 'function',
      location: 'settings.title_block',
    });
    return <TitleBlockLoadError />;
  }
  return <TitleBlockPage initial={settings} />;
}
