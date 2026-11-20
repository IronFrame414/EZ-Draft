// EZD-613 (S15g; Q-0210; Q-0214; ARCH Settings shell page contract): Settings > Code edition. Without
// settings_code_edition the no-access line in place (HTTP 200, URL unchanged); a failed load is reported
// (`code_edition_load_failed`) and shows the inline error with Retry. This static folder takes precedence over
// [section].
import { connection } from 'next/server';
import {
  CodeEditionLoadError,
  CodeEditionPage,
} from '../../../../components/settings/code-edition/CodeEditionForm';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import type { CodeEditionSettings } from '../../../../lib/code-edition/editions';
import { requireSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { loadCodeEditionSettings } from '../../../../server/code-edition/code-edition';
import { reportError } from '../../../../server/errors/report';
import { can } from '../../../../server/permissions';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_code_edition')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  let settings: CodeEditionSettings | null = null;
  try {
    settings = await loadCodeEditionSettings(createSessionClient());
  } catch {
    settings = null;
  }
  if (settings === null) {
    // Code only, never the caught message (ARCH Errors and logging).
    await reportError(new Error('code_edition_load_failed'), {
      source: 'function',
      location: 'settings.code_edition',
    });
    return <CodeEditionLoadError />;
  }
  return <CodeEditionPage initial={settings} />;
}
