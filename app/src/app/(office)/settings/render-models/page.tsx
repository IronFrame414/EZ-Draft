// EZD-1102 (S15f; Q-0210; 13b R2; ARCH Settings shell page contract): Settings > Render models. Without
// settings_render_models the no-access line in place (HTTP 200, URL unchanged); a failed load is reported
// (`render_models_load_failed`) and shows the inline error with Retry. Dollar figures are loaded only with
// see_company_costs, so they never reach the browser without it. This static folder takes precedence over
// [section].
import { connection } from 'next/server';
import {
  RenderModelsLoadError,
  RenderModelsPage,
} from '../../../../components/settings/render-models/RenderModelsForm';
import { SettingsMain } from '../../../../components/settings/SettingsShell';
import { NoAccess } from '../../../../components/states/NoAccess';
import type { RenderModelsSettings } from '../../../../lib/render-settings/models';
import { requireSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportError } from '../../../../server/errors/report';
import { can } from '../../../../server/permissions';
import { loadRenderModelsSettings } from '../../../../server/render-settings/render-settings';
import { settingsPermissionContext } from '../../../../server/settings/shell-data';

export default async function Page() {
  await connection();
  await requireSession();
  const ctx = await settingsPermissionContext();
  // The layout shows the load error.
  if (ctx === 'failed') return null;
  if (!can(ctx, 'settings_render_models')) {
    return (
      <SettingsMain>
        <NoAccess />
      </SettingsMain>
    );
  }
  let settings: RenderModelsSettings | null = null;
  try {
    settings = await loadRenderModelsSettings(createSessionClient(), {
      costs: can(ctx, 'see_company_costs'),
    });
  } catch {
    settings = null;
  }
  if (settings === null) {
    // Code only, never the caught message (ARCH Errors and logging).
    await reportError(new Error('render_models_load_failed'), {
      source: 'function',
      location: 'settings.render_models',
    });
    return <RenderModelsLoadError />;
  }
  return <RenderModelsPage initial={settings} />;
}
